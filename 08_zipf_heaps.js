'use strict';
/*
 * 08_zipf_heaps.js
 * Fits Zipf's law (word frequency against rank) and Heaps' law (vocabulary
 * against text length) to each magazine and compares the fitted values.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 08_zipf_heaps.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Options:  --tokens 100000  --reps 500  --perms 1000  (as in 07)
 *   Uses equalSizeStudy from 07_vocabulary_growth_hapax.js; cleaning,
 *   tokenising and stemming are done first by 01, 02 and 03.
 *   Takes about 15 seconds with the default options.
 *
 * OUTPUT
 *   Screen only:
 *     - the 10 most frequent words of each magazine, with frequency relative
 *       to rank 1 next to 1/rank, to show the Zipf pattern
 *     - for word forms and for stems: Heaps' beta and K, the Zipf slope over
 *       ranks 1 to 5,000, 10 to 1,000 and all ranks, and the share of tokens
 *       covered by the top 100 and top 1,000 words; each with the magazine
 *       means, middle 95% of samples, difference, p, and how often Yuba Manch
 *       is higher in paired samples
 *     - what beta means for doubling the text
 *   Files:  none.   Exports: none.
 *
 * METHOD
 *   Heaps' law: types V = K * N^beta, where N is the number of tokens.
 *     beta is the slope of log(V) against log(N) between 1,000 and 100,000
 *     tokens. beta < 1 means vocabulary grows more slowly than the text.
 *   Zipf's law: frequency is about C / rank^s. s is the slope of
 *     log(frequency) against log(rank), with ranks and frequencies taken from
 *     two random halves of the sample (Piantadosi, 2014).
 *   Both are measured on the same equal-sized samples as 07.
 *
 * In the presentation: slide 10.
 */
const { loadStemmedCorpora } = require('./03_stem');
const { equalSizeStudy, studyOptions } = require('./07_vocabulary_growth_hapax');
const { heading, printTable, fmt, fmtInt, fmtPct, fmtP } = require('./stats');

if (require.main === module) {
  const { corpora } = loadStemmedCorpora();
  const opts = studyOptions();

  heading("Zipf's law in the whole corpora: the most frequent words");
  for (const key of ['muna', 'yuba']) {
    const counts = new Map();
    for (const a of corpora[key].articles) for (const w of a.tokens) counts.set(w, (counts.get(w) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log(`\n${corpora[key].name}`);
    printTable(['Rank', 'Word', 'Frequency', 'Frequency / frequency of rank 1', '1 / rank'],
      top.map(([w, f], i) => [i + 1, w, fmtInt(f), fmt(f / top[0][1], 2), fmt(1 / (i + 1), 2)]));
  }
  console.log('\nUnder Zipf\'s law with slope 1 the last two columns would match.');

  console.log(`\nSampling ${fmtInt(opts.sampleTokens)} tokens ${opts.reps} times per magazine, with ${opts.perms} label shuffles. This takes a little while.`);
  const levels = { 'Word forms': equalSizeStudy(corpora, 'tokens', opts), 'Stems': equalSizeStudy(corpora, 'stems', opts) };

  const row = (label, s, f, fd = f) => [label, `${f(s.muna)} [${f(s.munaCI[0])}, ${f(s.munaCI[1])}]`, `${f(s.yuba)} [${f(s.yubaCI[0])}, ${f(s.yubaCI[1])}]`,
    `${fd(s.diff)} [${fd(s.diffCI[0])}, ${fd(s.diffCI[1])}]`, fmtP(s.p), fmtPct(s.yubaHigherShare, 0)];
  const head = ['', 'Muna (mean, 95% range)', 'Yuba Manch', 'Difference', 'p', 'Yuba higher in'];
  const three = x => fmt(x, 3), pct = x => fmtPct(x), points = x => fmt(100 * x, 1) + ' pts';

  for (const [name, study] of Object.entries(levels)) {
    const s = study.summary;
    heading(`Zipf and Heaps: ${name.toLowerCase()}, ${fmtInt(opts.sampleTokens)}-token samples`);
    printTable(head, [
      row("Heaps' beta", s.heapsBeta, three),
      row("Heaps' K", s.heapsK, x => fmt(x, 2)),
      row('Zipf slope, ranks 1 to 5,000', s.zipf1to5000, three),
      row('Zipf slope, ranks 10 to 1,000', s.zipf10to1000, three),
      row('Zipf slope, all ranks', s.zipfAllRanks, three),
      row('Tokens covered by top 100', s.top100, pct, points),
      row('Tokens covered by top 1,000', s.top1000, pct, points),
    ]);
  }
  console.log('\n"Yuba higher in" = share of the 500 paired samples in which Yuba Manch has the higher value.');

  heading('What the numbers mean');
  const b = levels['Word forms'].summary.heapsBeta;
  console.log(`Doubling the text multiplies the vocabulary by about 2^${fmt(b.muna, 2)} = ${fmt(2 ** b.muna, 2)} in Muna and 2^${fmt(b.yuba, 2)} = ${fmt(2 ** b.yuba, 2)} in Yuba Manch.`);
  console.log('beta is an average over 1,000 to 100,000 tokens: the real curve grows faster at the start and slower later.');
  console.log('A steeper Zipf slope means frequency falls faster with rank, so more of the text sits in the most frequent words.');
}
