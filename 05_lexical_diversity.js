'use strict';
/*
 * 05_lexical_diversity.js
 * Measures how varied the vocabulary of each article is with three
 * length-robust measures (MATTR, MTLD, HD-D) and compares the two magazines.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 05_lexical_diversity.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Cleaning, tokenising and stemming are done first by 01, 02 and 03.
 *
 * OUTPUT
 *   Screen: for each measure, each magazine's mean with a 95% bootstrap
 *     interval, the difference with its interval, Cohen's d, Cliff's delta
 *     and the p-value from 10,000 label shuffles; what the means look like in
 *     words; the same measures on stems; MATTR with a 100-word window and
 *     MTLD with a 0.60 threshold; MATTR with a 500-word window over each
 *     whole corpus.
 *   Files:  output/per_article_measures.csv, one row per article, columns:
 *     magazine, title, tokens, mattr50, mattr100, mtld, hdd, mtld060,
 *     stem_mattr50, stem_mtld, stem_hdd
 *   Exports (used by 06_length_control.js):
 *     mattr(tokens: string[], window = 50) -> number between 0 and 1,
 *       or NaN if the text is shorter than the window
 *     mtld(tokens: string[], threshold = 0.72) -> number (words per factor)
 *     hdd(tokens: string[], sample = 42) -> number between 0 and 1
 *
 * METHOD
 *   MATTR  slide a 50-word window along the article one word at a time, take
 *          the TTR of each window, and average them (Covington & McFall, 2010).
 *   MTLD   read word by word keeping a running TTR; each time it falls to 0.72
 *          count one "factor" and start again; MTLD = words / factors. Done
 *          forwards and backwards and averaged (McCarthy & Jarvis, 2010).
 *   HD-D   if you drew 42 words at random from the article, how many different
 *          ones would you expect? Reported as a share of 42 (McCarthy & Jarvis, 2010).
 *
 * In the presentation: slide 7.
 */
const fs = require('fs');
const path = require('path');
const { loadStemmedCorpora } = require('./03_stem');
const { ensureOutputDir } = require('./01_clean_corpus');
const { compareGroups, makeRng, heading, printTable, fmt, fmtCI, fmtP } = require('./stats');

function mattr(tokens, window = 50) {
  if (tokens.length < window) return NaN;
  const counts = new Map();
  let distinct = 0;
  for (let i = 0; i < window; i++) {                 // the first window
    const c = counts.get(tokens[i]) || 0;
    if (c === 0) distinct++;
    counts.set(tokens[i], c + 1);
  }
  let total = distinct, windows = 1;
  for (let i = window; i < tokens.length; i++) {      // move one word at a time
    const out = tokens[i - window], left = counts.get(out) - 1;
    if (left === 0) { counts.delete(out); distinct--; } else counts.set(out, left);
    const c = counts.get(tokens[i]) || 0;
    if (c === 0) distinct++;
    counts.set(tokens[i], c + 1);
    total += distinct; windows++;
  }
  return total / windows / window;                     // average TTR of all windows
}

function mtldOneWay(tokens, threshold) {
  let factors = 0, seen = new Set(), n = 0;
  for (const w of tokens) {
    seen.add(w); n++;
    if (seen.size / n <= threshold) { factors++; seen = new Set(); n = 0; }
  }
  if (n > 0) factors += (1 - seen.size / n) / (1 - threshold);   // part of a factor left at the end
  return factors > 0 ? tokens.length / factors : NaN;
}
function mtld(tokens, threshold = 0.72) {
  return (mtldOneWay(tokens, threshold) + mtldOneWay([...tokens].reverse(), threshold)) / 2;
}

function hdd(tokens, sample = 42) {
  const N = tokens.length, counts = new Map();
  for (const w of tokens) counts.set(w, (counts.get(w) || 0) + 1);
  let expected = 0;
  for (const c of counts.values()) {
    // chance that none of the c copies of this word is among the 42 drawn
    let pNone = 0;
    if (N - c >= sample) { pNone = 1; for (let i = 0; i < sample; i++) pNone *= (N - c - i) / (N - i); }
    expected += 1 - pNone;                             // chance the word appears at least once
  }
  return expected / sample;
}

module.exports = { mattr, mtld, hdd };

// ---------------------------------------------------------------------------
if (require.main === module) {
  const { corpora } = loadStemmedCorpora();
  const rng = makeRng(20261110);
  const measures = {
    mattr50: a => mattr(a.tokens, 50), mattr100: a => mattr(a.tokens, 100), mtld: a => mtld(a.tokens), hdd: a => hdd(a.tokens),
    mtld060: a => mtld(a.tokens, 0.60),
    stem_mattr50: a => mattr(a.stems, 50), stem_mtld: a => mtld(a.stems), stem_hdd: a => hdd(a.stems),
  };
  const values = {};
  for (const key of ['muna', 'yuba']) {
    values[key] = corpora[key].articles.map(a => {
      const row = { title: a.title, tokens: a.tokens.length };
      for (const [m, f] of Object.entries(measures)) row[m] = f(a);
      return row;
    });
  }
  const results = {};
  for (const m of Object.keys(measures)) results[m] = compareGroups(values.muna.map(r => r[m]), values.yuba.map(r => r[m]), rng);

  const row = (label, m, d = 3) => {
    const r = results[m];
    return [label, `${fmt(r.muna.mean, d)} ${fmtCI(r.muna.ci, d)}`, `${fmt(r.yuba.mean, d)} ${fmtCI(r.yuba.ci, d)}`,
      `${fmt(r.diff, d)} ${fmtCI(r.diffCI, d)}`, fmt(r.d, 2), fmt(r.cliff, 2), fmtP(r.p)];
  };
  const header = ['Measure', 'Muna (mean, 95% CI)', 'Yuba Manch (mean, 95% CI)', 'Difference (95% CI)', "Cohen's d", "Cliff's delta", 'p'];

  heading('Lexical diversity per article (word forms)');
  printTable(header, [row('MATTR, window 50', 'mattr50'), row('MTLD', 'mtld', 1), row('HD-D', 'hdd')]);
  console.log(`\nn = ${results.mattr50.muna.n} Muna and ${results.mattr50.yuba.n} Yuba Manch articles. p from 10,000 label shuffles; intervals from 5,000 bootstrap resamples.`);

  heading('What the numbers mean');
  console.log(`MATTR: ${fmt(results.mattr50.muna.mean)} x 50 = ${fmt(results.mattr50.muna.mean * 50, 1)} different words per 50 in Muna; ${fmt(results.mattr50.yuba.mean * 50, 1)} in Yuba Manch.`);
  console.log(`MTLD:  the vocabulary stays fresh for about ${fmt(results.mtld.muna.mean, 0)} words in Muna and ${fmt(results.mtld.yuba.mean, 0)} in Yuba Manch before TTR falls to 0.72.`);
  console.log(`HD-D:  of 42 randomly drawn words, about ${fmt(results.hdd.muna.mean * 42, 1)} are different in Muna and ${fmt(results.hdd.yuba.mean * 42, 1)} in Yuba Manch.`);

  heading('The same measures on stems');
  printTable(header, [row('MATTR, window 50', 'stem_mattr50'), row('MTLD', 'stem_mtld', 1), row('HD-D', 'stem_hdd')]);

  heading('Other settings');
  printTable(header, [row('MATTR, window 100', 'mattr100'), row('MTLD, threshold 0.60', 'mtld060', 1)]);
  const whole = key => mattr(corpora[key].articles.flatMap(a => a.tokens), 500);
  console.log(`\nMATTR with a 500-word window over each whole corpus: Muna ${fmt(whole('muna'))}, Yuba Manch ${fmt(whole('yuba'))}.`);
  console.log('MATTR falls as the window grows, so values are only comparable at the same window.');

  const file = path.join(ensureOutputDir(), 'per_article_measures.csv');
  const cols = ['tokens', ...Object.keys(measures)];
  const quote = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ['magazine,title,' + cols.join(',')];
  for (const key of ['muna', 'yuba']) for (const r of values[key]) lines.push([corpora[key].name, quote(r.title), ...cols.map(c => (typeof r[c] === 'number' ? +r[c].toFixed(4) : r[c]))].join(','));
  fs.writeFileSync(file, '﻿' + lines.join('\n') + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), file)} (one row per article).`);
}
