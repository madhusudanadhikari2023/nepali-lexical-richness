'use strict';
/*
 * 07_vocabulary_growth_hapax.js
 * Compares vocabulary size and rare words (hapax legomena) in samples of the
 * same size from each magazine, and traces how vocabulary grows with text.
 * Also holds the equal-size sampling engine that 08_zipf_heaps.js reuses.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 07_vocabulary_growth_hapax.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Options:  --tokens 100000   tokens in each sample
 *             --reps 500        samples per magazine
 *             --perms 1000      label shuffles for the p-values
 *   Cleaning, tokenising and stemming are done first by 01, 02 and 03.
 *   Takes about 15 seconds with the default options.
 *
 * OUTPUT
 *   Screen: for word forms and for stems: number of different words, hapax
 *     share of types, and hapax per 100 tokens; each magazine's mean with the
 *     middle 95% of its samples, the difference with its range, and p.
 *   Files:  output/vocabulary_growth_curve.csv, 40 rows, columns: tokens,
 *     muna_word_forms, yuba_manch_word_forms, muna_stems, yuba_manch_stems
 *     (mean number of different words after that many running tokens).
 *   Exports (used by 08_zipf_heaps.js):
 *     equalSizeStudy(corpora, level: 'tokens' | 'stems', options) -> {
 *       summary:  { <statistic>: { muna, munaCI, yuba, yubaCI, diff, diffCI,
 *                                  p, yubaHigherShare } },
 *       curves:   { muna: [{ tokens, types }], yuba: [{ tokens, types }] },
 *       settings: { sampleTokens, reps, perms } }
 *       statistics: types, hapaxShare, hapaxPer100, heapsBeta, heapsK,
 *       zipf1to5000, zipf10to1000, zipfAllRanks, top100, top1000
 *     studyOptions() -> { sampleTokens, reps, perms } from the command line
 *
 * METHOD
 *   Yuba Manch has more than twice as many tokens, so whole-corpus counts are
 *   not comparable. Instead, for each magazine:
 *     1. put its articles in a random order and join them
 *     2. keep the first 100,000 tokens
 *     3. count different words (types) and words that occur only once (hapax)
 *     4. repeat 500 times; report the mean and the middle 95% of the results
 *   The difference is tested by shuffling the magazine labels of the articles
 *   1,000 times and repeating steps 1 to 3 for each shuffle.
 *
 * In the presentation: slide 9.
 */
const fs = require('fs');
const path = require('path');
const { loadStemmedCorpora } = require('./03_stem');
const { ensureOutputDir, parseArgs } = require('./01_clean_corpus');
const { makeRng, shuffleInPlace, mean, percentile, linearFit, heading, printTable, fmt, fmtInt, fmtPct, fmtP } = require('./stats');

// 40 points spaced evenly on a log scale from 1,000 tokens to the sample size
function checkpoints(sampleTokens) {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push(Math.round(10 ** (3 + (Math.log10(sampleTokens) - 3) * i / 39)));
  return [...new Set(pts)];
}

// Turn every word (or stem) into a number, so counting is fast
function encode(corpora, level) {
  const ids = new Map(), enc = {};
  for (const key of ['muna', 'yuba']) {
    enc[key] = corpora[key].articles.map(a => Int32Array.from(a[level], w => {
      let id = ids.get(w);
      if (id === undefined) { id = ids.size; ids.set(w, id); }
      return id;
    }));
  }
  return { enc, vocabSize: ids.size };
}

function popcount(x) {                       // number of 1 bits in a 32-bit number
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
}
function coinFlipHeads(n, rng) {             // heads in n fair coin flips
  let heads = 0;
  for (; n >= 32; n -= 32) heads += popcount(rng.uint32());
  if (n > 0) heads += popcount(rng.uint32() & ((1 << n) - 1));
  return heads;
}

// Returns a function that measures one equal-sized sample
function makeSampler(vocabSize, sampleTokens, rng) {
  const counts = new Int32Array(vocabSize);
  const touched = new Int32Array(Math.min(vocabSize, sampleTokens));
  const pts = checkpoints(sampleTokens), logPts = pts.map(Math.log);

  return function measure(articles, order) {
    // join articles in this order until sampleTokens tokens; note the number
    // of different words seen so far at each checkpoint (the growth curve)
    let pos = 0, V = 0, k = 0;
    const curve = new Float64Array(pts.length);
    outer: for (const ai of order) {
      const art = articles[ai];
      for (let j = 0; j < art.length; j++) {
        if (pos === sampleTokens) break outer;
        while (k < pts.length && pts[k] === pos) curve[k++] = V;
        const id = art[j];
        if (counts[id] === 0) touched[V++] = id;
        counts[id]++; pos++;
      }
    }
    while (k < pts.length && pts[k] <= pos) curve[k++] = V;
    if (pos < sampleTokens) throw new Error(`Only ${pos} tokens available, fewer than --tokens ${sampleTokens}`);

    // hapax and how much text the most frequent words cover
    let hapax = 0, maxCount = 0;
    for (let i = 0; i < V; i++) { const c = counts[touched[i]]; if (c === 1) hapax++; if (c > maxCount) maxCount = c; }
    const hist = new Int32Array(maxCount + 1);
    for (let i = 0; i < V; i++) hist[counts[touched[i]]]++;
    const topShare = n => { let left = n, s = 0; for (let c = maxCount; c > 0 && left > 0; c--) { const take = Math.min(hist[c], left); s += take * c; left -= take; } return s / sampleTokens; };

    // Heaps' law: straight line through log(types) against log(tokens)
    const heaps = linearFit(logPts, Array.from(curve, Math.log));

    // Zipf's law, split-half method (Piantadosi, 2014): split every word's
    // occurrences at random into halves A and B; rank words by A; fit the
    // slope of log(frequency in B) against log(rank)
    const A = new Int32Array(V), B = new Int32Array(V);
    let maxA = 0;
    for (let i = 0; i < V; i++) { const c = counts[touched[i]], a = coinFlipHeads(c, rng); A[i] = a; B[i] = c - a; if (a > maxA) maxA = a; }
    const start = new Int32Array(maxA + 2), order2 = new Int32Array(V);
    for (let i = 0; i < V; i++) start[maxA - A[i] + 1]++;           // counting sort by A, largest first
    for (let b = 1; b < start.length; b++) start[b] += start[b - 1];
    for (let i = 0; i < V; i++) order2[start[maxA - A[i]]++] = i;
    const zipf = (lo, hi) => {
      const x = [], y = [];
      for (let r = lo; r <= Math.min(hi, V); r++) { const f = B[order2[r - 1]]; if (f > 0) { x.push(Math.log(r)); y.push(Math.log(f)); } }
      return -linearFit(x, y).slope;
    };

    const result = {
      types: V, hapaxShare: hapax / V, hapaxPer100: 100 * hapax / sampleTokens,
      heapsBeta: heaps.slope, heapsK: Math.exp(heaps.intercept),
      zipf1to5000: zipf(1, 5000), zipf10to1000: zipf(10, 1000), zipfAllRanks: zipf(1, Infinity),
      top100: topShare(100), top1000: topShare(1000), curve,
    };
    for (let i = 0; i < V; i++) counts[touched[i]] = 0;            // reset for the next sample
    return result;
  };
}

const STAT_KEYS = ['types', 'hapaxShare', 'hapaxPer100', 'heapsBeta', 'heapsK', 'zipf1to5000', 'zipf10to1000', 'zipfAllRanks', 'top100', 'top1000'];

// The whole procedure for one level ('tokens' = word forms, 'stems')
function equalSizeStudy(corpora, level, { sampleTokens = 100000, reps = 500, perms = 1000, seed = 20261110 } = {}) {
  const rng = makeRng(seed);
  const { enc, vocabSize } = encode(corpora, level);
  const measure = makeSampler(vocabSize, sampleTokens, rng);
  const label = level === 'stems' ? 'stems' : 'word forms';
  const progress = (what, i, n) => { if (process.stderr.isTTY) process.stderr.write(`\r  ${label}: ${what} ${i}/${n}   `); };

  const runs = {};
  for (const key of ['muna', 'yuba']) {
    const order = Array.from(enc[key], (_, i) => i);
    runs[key] = [];
    for (let r = 0; r < reps; r++) { shuffleInPlace(order, rng); runs[key].push(measure(enc[key], order)); if (r % 50 === 0) progress(`samples (${key})`, r, reps); }
  }
  const est = (key, stat) => mean(runs[key].map(s => s[stat]));

  // permutation test: give the articles random magazine labels
  const pool = [...enc.muna, ...enc.yuba], nMuna = enc.muna.length;
  const idx = Array.from(pool, (_, i) => i);
  const extreme = Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
  const observed = Object.fromEntries(STAT_KEYS.map(k => [k, est('yuba', k) - est('muna', k)]));
  for (let r = 0; r < perms; r++) {
    shuffleInPlace(idx, rng);
    const a = measure(pool, idx.slice(0, nMuna)), b = measure(pool, idx.slice(nMuna));
    for (const k of STAT_KEYS) if (Math.abs(b[k] - a[k]) >= Math.abs(observed[k])) extreme[k]++;
    if (r % 50 === 0) progress('label shuffles', r, perms);
  }
  if (process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(60) + '\r');

  const summary = {};
  for (const k of STAT_KEYS) {
    const m = runs.muna.map(s => s[k]), y = runs.yuba.map(s => s[k]), d = y.map((v, i) => v - m[i]);
    summary[k] = {
      muna: mean(m), munaCI: [percentile(m, 2.5), percentile(m, 97.5)],
      yuba: mean(y), yubaCI: [percentile(y, 2.5), percentile(y, 97.5)],
      diff: observed[k], diffCI: [percentile(d, 2.5), percentile(d, 97.5)],
      p: (extreme[k] + 1) / (perms + 1),
      yubaHigherShare: mean(d.map(v => (v > 0 ? 1 : 0))),
    };
  }
  const curve = key => checkpoints(sampleTokens).map((n, i) => ({ tokens: n, types: mean(runs[key].map(s => s.curve[i])) }));
  return { summary, curves: { muna: curve('muna'), yuba: curve('yuba') }, settings: { sampleTokens, reps, perms } };
}

function studyOptions() {
  const { flags } = parseArgs();
  return { sampleTokens: +(flags.tokens || 100000), reps: +(flags.reps || 500), perms: +(flags.perms || 1000) };
}

module.exports = { equalSizeStudy, studyOptions };

// ---------------------------------------------------------------------------
if (require.main === module) {
  const { corpora } = loadStemmedCorpora();
  const opts = studyOptions();
  console.log(`Sampling ${fmtInt(opts.sampleTokens)} tokens ${opts.reps} times per magazine, with ${opts.perms} label shuffles. This takes a little while.`);
  const forms = equalSizeStudy(corpora, 'tokens', opts);
  const stems = equalSizeStudy(corpora, 'stems', opts);

  const row = (label, s, f, fd = f) => [label, `${f(s.muna)} [${f(s.munaCI[0])}, ${f(s.munaCI[1])}]`, `${f(s.yuba)} [${f(s.yubaCI[0])}, ${f(s.yubaCI[1])}]`,
    `${fd(s.diff)} [${fd(s.diffCI[0])}, ${fd(s.diffCI[1])}]`, fmtP(s.p)];
  const head = ['', 'Muna (mean, 95% range)', 'Yuba Manch', 'Difference', 'p'];
  const pct = x => fmtPct(x), points = x => fmt(100 * x, 1) + ' pts', one = x => fmt(x, 1);

  heading(`Vocabulary in ${fmtInt(opts.sampleTokens)} tokens (word forms)`);
  printTable(head, [
    row('Different word forms', forms.summary.types, fmtInt),
    row('Hapax share of types', forms.summary.hapaxShare, pct, points),
    row('Hapax per 100 tokens', forms.summary.hapaxPer100, one),
  ]);
  heading(`The same on stems`);
  printTable(head, [
    row('Different stems', stems.summary.types, fmtInt),
    row('Hapax share of stem types', stems.summary.hapaxShare, pct, points),
    row('Hapax stems per 100 tokens', stems.summary.hapaxPer100, one),
  ]);
  console.log('\nThe 95% range is the middle 95% of the 500 samples. p comes from the label shuffles.');

  heading('What the numbers mean');
  const t = forms.summary.types, h = forms.summary.hapaxPer100;
  console.log(`Yuba Manch has ${fmtPct(t.yuba / t.muna - 1, 0)} more different word forms in the same amount of text.`);
  console.log(`A reader meets a word that occurs only once about every ${fmt(100 / h.yuba, 1)} words in Yuba Manch and every ${fmt(100 / h.muna, 1)} in Muna.`);

  const file = path.join(ensureOutputDir(), 'vocabulary_growth_curve.csv');
  const lines = ['tokens,muna_word_forms,yuba_manch_word_forms,muna_stems,yuba_manch_stems'];
  forms.curves.muna.forEach((p, i) => lines.push([p.tokens, forms.curves.muna[i].types, forms.curves.yuba[i].types, stems.curves.muna[i].types, stems.curves.yuba[i].types].map(v => Math.round(v)).join(',')));
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), file)}: the vocabulary growth curve, ready to plot.`);
}
