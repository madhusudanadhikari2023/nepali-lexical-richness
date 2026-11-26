'use strict';
/*
 * 02_tokenise.js
 * Splits the cleaned articles into word tokens and sentences, and drops
 * articles that are too short to measure.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 02_tokenise.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Cleaning is done first by 01_clean_corpus.js.
 *
 * OUTPUT
 *   Screen: articles analysed and left out, word tokens, different words
 *     (types), sentences, mean / median / shortest / longest article length,
 *     words in Latin script, and one sentence split into tokens.
 *   Files:  none.
 *   Exports (used by the later scripts):
 *     tokenise(text: string) -> string[]          the word tokens of a text
 *     sentenceLengths(text: string) -> number[]  number of tokens in each sentence
 *     loadCorpora() -> { muna: Corpus, yuba: Corpus }
 *       Corpus = { name: string,
 *                  articles: [{ title, url, text: string, tokens: string[] }],
 *                  shortExcluded: number (articles under 100 tokens),
 *                  cleaning: the counts from 01_clean_corpus.js }
 *     TOKEN, LATIN (regular expressions), MIN_TOKENS (100)
 *
 * METHOD
 *   A word token is one unbroken run of Devanagari letters and vowel signs.
 *   Numerals (० to ९ and 0 to 9), the danda and all punctuation are left out.
 *   Words in Latin script are counted separately and are not tokens.
 *   The plural marker हरु is written as हरू so both spellings count as one.
 *   A one-line author note at the end ("उहाँ गोरखापत्र ...") is removed.
 *   Sentences end at । ? ! or ॥.
 *   Articles with fewer than 100 tokens are left out, because the diversity
 *   measures need a minimum length.
 *
 * In the presentation: slide 4 (corpus size) and slide 5, step 3.
 */
const { loadCleanCorpora, S, charLength } = require('./01_clean_corpus');
const { heading, printTable, fmtInt, mean, median } = require('./stats');

const TOKEN = /[ँ-ॣॱ-ॿ]+/g;  // Devanagari letters and signs, no digits or danda
const LATIN = /[A-Za-z]{2,}/g;
const SENTENCE_END = /[।?!॥]/;
const AUTHOR_NOTE = new RegExp(`[^।?!]*उहाँ गोरखापत्र[^।?!]*[।?!]?${S}*$`);
const MIN_TOKENS = 100;

// हरु -> हरू when it is in the last few letters of the word
const normaliseToken = w => (w.slice(-6).includes('हरु') ? w.split('हरु').join('हरू') : w);
const tokenise = text => (text.match(TOKEN) || []).map(normaliseToken);
// number of tokens in each sentence
const sentenceLengths = text => text.split(SENTENCE_END).map(s => (s.match(TOKEN) || []).length).filter(n => n > 0);

function removeAuthorNote(text) {
  const lastChars = [...text].slice(-250).join('');
  return lastChars.includes('उहाँ गोरखापत्र') ? text.replace(AUTHOR_NOTE, '') : text;
}

// Cleaned, tokenised corpora with short articles removed. Used by every later script.
function loadCorpora() {
  const clean = loadCleanCorpora(), out = {};
  for (const key of ['muna', 'yuba']) {
    const kept = [];
    let short = 0;
    for (const a of clean[key].articles) {
      const text = removeAuthorNote(a.text);
      const tokens = tokenise(text);
      if (tokens.length >= MIN_TOKENS) kept.push({ title: a.title, url: a.url, text, tokens });
      else short++;
    }
    out[key] = { name: clean[key].name, articles: kept, shortExcluded: short, cleaning: clean[key].tally };
  }
  return out;
}

module.exports = { loadCorpora, tokenise, sentenceLengths, TOKEN, LATIN, MIN_TOKENS };

// ---------------------------------------------------------------------------
if (require.main === module) {
  const corpora = loadCorpora();
  const rows = {};
  for (const key of ['muna', 'yuba']) {
    const arts = corpora[key].articles;
    const lengths = arts.map(a => a.tokens.length);
    const types = new Set(arts.flatMap(a => a.tokens));
    rows[key] = {
      articles: arts.length,
      short: corpora[key].shortExcluded,
      tokens: lengths.reduce((s, v) => s + v, 0),
      types: types.size,
      sentences: arts.reduce((s, a) => s + sentenceLengths(a.text).length, 0),
      meanLength: mean(lengths), medianLength: median(lengths),
      minLength: Math.min(...lengths), maxLength: Math.max(...lengths),
      latin: arts.reduce((s, a) => s + (a.text.match(LATIN) || []).length, 0),
    };
  }
  heading('Corpus size after tokenising');
  const r = (label, k, f = fmtInt) => [label, f(rows.muna[k]), f(rows.yuba[k])];
  printTable(['', 'Muna', 'Yuba Manch'], [
    r('Articles with 100+ tokens (analysed)', 'articles'),
    r('Articles under 100 tokens (left out)', 'short'),
    r('Word tokens', 'tokens'),
    r('Word-form types (different words)', 'types'),
    r('Sentences', 'sentences'),
    r('Mean article length (tokens)', 'meanLength'),
    r('Median article length (tokens)', 'medianLength'),
    ['Shortest / longest article', `${rows.muna.minLength} / ${fmtInt(rows.muna.maxLength)}`, `${rows.yuba.minLength} / ${fmtInt(rows.yuba.maxLength)}`],
    r('Words in Latin script (not counted)', 'latin'),
  ]);
  console.log(`\nTotal: ${fmtInt(rows.muna.articles + rows.yuba.articles)} articles, ${fmtInt(rows.muna.tokens + rows.yuba.tokens)} word tokens.`);

  heading('Example: one sentence split into tokens');
  const text = corpora.muna.articles[0].text;
  const sentence = text.split(SENTENCE_END).find(s => (s.match(TOKEN) || []).length >= 8) || text.slice(0, 200);
  console.log(`Sentence: ${sentence.trim()}।`);
  console.log(`Tokens:   ${tokenise(sentence).join(' | ')}`);
  console.log(`(${tokenise(sentence).length} tokens, ${charLength(sentence.trim())} characters)`);
}
