'use strict';
/*
 * 12_word_sentence_length.js
 * Compares how long the words and sentences are in each magazine.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 12_word_sentence_length.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Uses sentenceLengths from 02_tokenise.js and countAksharas from 03_stem.js.
 *
 * OUTPUT
 *   Screen only, one table: mean word length in aksharas, share of words with
 *     5 or more aksharas, and mean sentence length in words. For each: each
 *     magazine's mean with 95% bootstrap interval, the difference, Cohen's d,
 *     p, p after controlling for article length, and the standard deviation
 *     across articles.
 *   Files:  none.   Exports: none.
 *
 * METHOD
 *   Word length is counted in aksharas (written syllables), which suits
 *   Devanagari better than counting characters.
 *   Sentence length = number of word tokens between । ? ! or ॥.
 *   Both are averaged within each article, then compared across articles.
 *   The length control is the regression used in 06_length_control.js.
 *
 * In the presentation: slide 14 (conclusions).
 */
const { loadCorpora, sentenceLengths } = require('./02_tokenise');
const { countAksharas } = require('./03_stem');
const { compareGroups, ols, makeRng, mean, heading, printTable, fmt, fmtCI, fmtP } = require('./stats');

if (require.main === module) {
  const corpora = loadCorpora();
  const rng = makeRng(20261110);
  const perArticle = a => {
    const ak = a.tokens.map(w => Math.max(countAksharas(w), 1));
    return { wordLength: mean(ak), longWords: mean(ak.map(n => (n >= 5 ? 1 : 0))), sentenceLength: mean(sentenceLengths(a.text)), tokens: a.tokens.length };
  };
  const m = corpora.muna.articles.map(perArticle), y = corpora.yuba.articles.map(perArticle);
  const all = [...m.map(r => ({ ...r, yuba: 0 })), ...y.map(r => ({ ...r, yuba: 1 }))];

  const features = [['Mean word length (aksharas)', 'wordLength', 2], ['Share of words with 5+ aksharas', 'longWords', 3], ['Mean sentence length (words)', 'sentenceLength', 1]];
  const rows = features.map(([label, k, d]) => {
    const c = compareGroups(m.map(r => r[k]), y.map(r => r[k]), rng);
    const fit = ols(all.map(r => [1, Math.log(r.tokens), r.yuba]), all.map(r => r[k]));
    return [label, `${fmt(c.muna.mean, d)} ${fmtCI(c.muna.ci, d)}`, `${fmt(c.yuba.mean, d)} ${fmtCI(c.yuba.ci, d)}`, fmt(c.diff, d), fmt(c.d, 2), fmtP(c.p), fmtP(fit.p[2]), `${fmt(c.muna.sd, d)} / ${fmt(c.yuba.sd, d)}`];
  });
  heading('Word length and sentence length per article');
  printTable(['Feature', 'Muna (mean, 95% CI)', 'Yuba Manch', 'Difference', "Cohen's d", 'p', 'p after length control', 'SD across articles (Muna / Yuba)'], rows);
  console.log('\n"p after length control" comes from a regression on log(article length) plus magazine, as in 06_length_control.js.');
}
