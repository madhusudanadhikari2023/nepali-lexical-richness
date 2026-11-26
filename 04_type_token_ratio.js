'use strict';
/*
 * 04_type_token_ratio.js
 * Computes the type-token ratio (TTR) of every article and compares the two
 * magazines, showing why this simple measure misleads when article lengths differ.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 04_type_token_ratio.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Cleaning and tokenising are done first by 01 and 02.
 *
 * OUTPUT
 *   Screen: for TTR and for article length, each magazine's mean with a 95%
 *     bootstrap interval, the difference, Cohen's d, Cliff's delta and the
 *     p-value; then a worked example of how many different words a typical
 *     article contains, by multiplication and by direct count.
 *   Files:  none.
 *   Exports:
 *     ttr(tokens: string[]) -> number between 0 and 1
 *
 * METHOD
 *   TTR = number of different words / total number of words, per article.
 *   A longer text keeps repeating common words such as र, छ and पनि, so its
 *   TTR falls even when it uses more different words in total.
 *
 * In the presentation: slide 6.
 */
const { loadCorpora } = require('./02_tokenise');
const { compareGroups, makeRng, mean, heading, printTable, fmt, fmtCI, fmtP, fmtInt } = require('./stats');

const ttr = tokens => new Set(tokens).size / tokens.length;

module.exports = { ttr };

// ---------------------------------------------------------------------------
if (require.main === module) {
  const corpora = loadCorpora();
  const rng = makeRng(20261110);
  const muna = corpora.muna.articles, yuba = corpora.yuba.articles;

  const t = compareGroups(muna.map(a => ttr(a.tokens)), yuba.map(a => ttr(a.tokens)), rng);
  const len = compareGroups(muna.map(a => a.tokens.length), yuba.map(a => a.tokens.length), rng);

  heading('Type-token ratio per article');
  printTable(['', 'Muna', 'Yuba Manch', 'Difference', "Cohen's d", "Cliff's delta", 'p'], [
    ['TTR (mean, 95% CI)', `${fmt(t.muna.mean)} ${fmtCI(t.muna.ci)}`, `${fmt(t.yuba.mean)} ${fmtCI(t.yuba.ci)}`, fmt(t.diff), fmt(t.d, 2), fmt(t.cliff, 2), fmtP(t.p)],
    ['Article length (mean words)', fmtInt(len.muna.mean), fmtInt(len.yuba.mean), fmtInt(len.diff), fmt(len.d, 2), fmt(len.cliff, 2), fmtP(len.p)],
  ]);

  heading('Work it out for a typical article');
  for (const [name, g] of [['Muna', 'muna'], ['Yuba Manch', 'yuba']]) {
    const words = Math.round(len[g].mean), ratio = +t[g].mean.toFixed(3);
    console.log(`${name.padEnd(11)} ${words} words x ${ratio} = about ${fmtInt(words * ratio)} different words`);
  }
  const typesPerArticle = arts => mean(arts.map(a => new Set(a.tokens).size));
  console.log(`\nThat multiplication is a rough guide. Counted directly, the average article has ${fmtInt(typesPerArticle(muna))} different words in Muna and ${fmtInt(typesPerArticle(yuba))} in Yuba Manch.`);
  console.log('Either way, Yuba Manch uses more different words; its ratio is lower only because its articles are longer.');
}
