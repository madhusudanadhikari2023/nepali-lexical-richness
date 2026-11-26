'use strict';
/*
 * 06_length_control.js
 * Checks whether the lexical diversity differences are just an effect of
 * Yuba Manch articles being longer.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 06_length_control.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Uses mattr, mtld and hdd from 05_lexical_diversity.js; cleaning,
 *   tokenising and stemming are done first by 01, 02 and 03.
 *
 * OUTPUT
 *   Screen only, three tables, for word forms and for stems:
 *     1. correlation r (from -1 to 1) of each measure with log(article length)
 *     2. first 300 words only: each magazine's mean, the difference,
 *        Cohen's d, p, and how many articles were long enough
 *     3. regression: the magazine difference after accounting for length,
 *        the adjusted d, its p-value, and the effect of log(length)
 *   Files:  none.   Exports: none.
 *
 * METHOD
 *   Check 1 compares every article over the same length: its first 300 words
 *   (articles with fewer than 300 words are left out).
 *   Check 2 fits  measure = a + b * log(article length) + c * (1 if Yuba Manch)
 *   by least squares. c is the difference between the magazines once length
 *   is accounted for; adjusted d = c / residual standard deviation.
 *
 * In the presentation: slide 8.
 */
const { loadStemmedCorpora } = require('./03_stem');
const { mattr, mtld, hdd } = require('./05_lexical_diversity');
const { compareGroups, ols, correlation, makeRng, heading, printTable, fmt, fmtP } = require('./stats');

if (require.main === module) {
  const { corpora } = loadStemmedCorpora();
  const rng = makeRng(20261110);
  const measures = {
    'MATTR, window 50': { f: t => mattr(t, 50), level: 'tokens', d: 3 },
    'MTLD': { f: t => mtld(t), level: 'tokens', d: 1 },
    'HD-D': { f: t => hdd(t), level: 'tokens', d: 3 },
    'MATTR, window 50 (stems)': { f: t => mattr(t, 50), level: 'stems', d: 3 },
    'MTLD (stems)': { f: t => mtld(t), level: 'stems', d: 1 },
    'HD-D (stems)': { f: t => hdd(t), level: 'stems', d: 3 },
  };
  const all = [...corpora.muna.articles.map(a => ({ a, yuba: 0 })), ...corpora.yuba.articles.map(a => ({ a, yuba: 1 }))];
  const logLength = all.map(x => Math.log(x.a.tokens.length));

  const rowsCorr = [], rowsFirst = [], rowsReg = [];
  for (const [name, m] of Object.entries(measures)) {
    const y = all.map(x => m.f(x.a[m.level]));
    rowsCorr.push([name, fmt(correlation(logLength, y), 2)]);

    // check 1: first 300 words
    const first = key => corpora[key].articles.filter(a => a.tokens.length >= 300).map(a => m.f(a[m.level].slice(0, 300)));
    const c = compareGroups(first('muna'), first('yuba'), rng);
    rowsFirst.push([name, fmt(c.muna.mean, m.d), fmt(c.yuba.mean, m.d), fmt(c.diff, m.d), fmt(c.d, 2), fmtP(c.p), `${c.muna.n} / ${c.yuba.n}`]);

    // check 2: regression on log length plus a magazine indicator
    const fit = ols(all.map((x, i) => [1, logLength[i], x.yuba]), y);
    rowsReg.push([name, fmt(fit.coef[2], m.d), fmt(fit.coef[2] / fit.residualSD, 2), fmtP(fit.p[2]), fmt(fit.coef[1], m.d)]);
  }

  heading('Do the measures still depend on article length?');
  console.log('Correlation of each measure with log(article length), all articles:\n');
  printTable(['Measure', 'r'], rowsCorr);

  heading('Check 1: only the first 300 words of each article');
  printTable(['Measure', 'Muna', 'Yuba Manch', 'Difference', "Cohen's d", 'p', 'Articles (Muna / Yuba)'], rowsFirst);

  heading('Check 2: regression on log(article length)');
  printTable(['Measure', 'Magazine difference', 'Adjusted d', 'p', 'Effect of log length'], rowsReg);
  console.log('\nAdjusted d = magazine difference / residual standard deviation.');
  console.log('A measure whose difference survives both checks is not just a length effect.');
}
