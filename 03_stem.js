'use strict';
/*
 * 03_stem.js
 * Reduces word forms to stems by stripping attached postpositions, particles
 * and the plural marker, so that घर, घरमा and घरको count as one word.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 03_stem.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Cleaning and tokenising are done first by 01 and 02.
 *
 * OUTPUT
 *   Screen: different word forms in both corpora, how many the stemmer
 *     changed, different stems after stemming, types per magazine before and
 *     after stemming, example words, and 15 randomly chosen changed words.
 *   Files:  output/stem_check_sample.tsv: 300 randomly chosen changed words,
 *     tab-separated, columns: word, stem, correct? (y/n). Fill in the last
 *     column by hand to estimate the stemmer's error rate.
 *   Exports (used by the later scripts):
 *     loadStemmedCorpora() -> { corpora, stem, formCounts }
 *       corpora:    as loadCorpora() in 02_tokenise.js, with stems: string[]
 *                   added to every article (same length as tokens)
 *       stem:       function (word: string) -> string
 *       formCounts: Map<string, number>, how often each word form occurs
 *                   in both corpora together
 *     makeStemmer(formCounts) -> stem function
 *     countAksharas(word: string) -> number of written syllables
 *     SUFFIXES: string[], the 39 suffixes, longest first
 *
 * METHOD
 *   39 suffixes are tried, longest first: हरू plus 38 postpositions and
 *   particles. Up to three are removed per word (घरहरूमा -> घरहरू -> घर).
 *   Two safety rules stop it cutting too much: what remains must have at least
 *   two aksharas, and must itself occur as a word at least twice in the
 *   corpora. So आमा is not cut to आ, and सीमा is not cut to सी.
 *   Verb endings are NOT removed.
 *
 * In the presentation: slide 5, step 4.
 */
const fs = require('fs');
const path = require('path');
const { loadCorpora } = require('./02_tokenise');
const { ensureOutputDir } = require('./01_clean_corpus');
const { heading, printTable, fmtInt, makeRng, shuffleInPlace } = require('./stats');

const SUFFIXES = ['हरू', 'ले', 'लाई', 'को', 'का', 'की', 'मा', 'बाट', 'देखि', 'सँग', 'सित', 'तिर', 'सम्म', 'द्वारा',
  'भन्दा', 'भित्र', 'माथि', 'मुनि', 'बिच', 'बीच', 'प्रति', 'सहित', 'समेत', 'पछि', 'अघि', 'बारे', 'झैँ', 'जस्तै',
  'नै', 'कै', 'मै', 'चाहिँ', 'पनि', 'सम्बन्धी', 'अनुसार', 'बाहेक', 'विरुद्ध', 'सामु', 'तर्फ']
  .sort((a, b) => b.length - a.length);       // try the longest suffix first

// Aksharas (written syllables): count consonants and independent vowels,
// but not a consonant that follows a virama (्), because it joins a conjunct.
function countAksharas(word) {
  let n = 0, prev = '';
  for (const ch of word) {
    const c = ch.codePointAt(0);
    const isLetter = (c >= 0x0904 && c <= 0x0939) || (c >= 0x0958 && c <= 0x0961) || (c >= 0x0972 && c <= 0x097F);
    if (isLetter && prev !== '्') n++;
    prev = ch;
  }
  return n;
}

// formCounts: how often each word form occurs in both corpora together
function makeStemmer(formCounts) {
  const cache = new Map();
  return function stem(word) {
    if (cache.has(word)) return cache.get(word);
    let s = word;
    for (let round = 0; round < 3; round++) {
      let stripped = false;
      for (const suffix of SUFFIXES) {
        if (s.endsWith(suffix) && s.length > suffix.length) {
          const rest = s.slice(0, -suffix.length);
          if (countAksharas(rest) >= 2 && (formCounts.get(rest) || 0) >= 2) { s = rest; stripped = true; break; }
        }
      }
      if (!stripped) break;
    }
    cache.set(word, s);
    return s;
  };
}

// Corpora with a .stems list next to .tokens in every article
function loadStemmedCorpora() {
  const corpora = loadCorpora();
  const formCounts = new Map();
  for (const key of ['muna', 'yuba']) for (const a of corpora[key].articles) for (const w of a.tokens) formCounts.set(w, (formCounts.get(w) || 0) + 1);
  const stem = makeStemmer(formCounts);
  for (const key of ['muna', 'yuba']) for (const a of corpora[key].articles) a.stems = a.tokens.map(stem);
  return { corpora, stem, formCounts };
}

module.exports = { loadStemmedCorpora, makeStemmer, countAksharas, SUFFIXES };

// ---------------------------------------------------------------------------
if (require.main === module) {
  const { corpora, stem, formCounts } = loadStemmedCorpora();
  const forms = [...formCounts.keys()];
  const changed = forms.filter(w => stem(w) !== w);
  const stems = new Set(forms.map(stem));

  heading('Stemming');
  console.log(`Suffixes tried: ${SUFFIXES.length} (हरू plus ${SUFFIXES.length - 1} postpositions and particles)\n`);
  printTable(['', 'Both corpora'], [
    ['Different word forms', fmtInt(forms.length)],
    ['Word forms the stemmer changed', fmtInt(changed.length)],
    ['Different stems after stemming', fmtInt(stems.size)],
  ]);
  console.log('');
  printTable(['', 'Muna', 'Yuba Manch'], [
    ['Word-form types', ...['muna', 'yuba'].map(k => fmtInt(new Set(corpora[k].articles.flatMap(a => a.tokens)).size))],
    ['Stem types', ...['muna', 'yuba'].map(k => fmtInt(new Set(corpora[k].articles.flatMap(a => a.stems)).size))],
  ]);

  heading('Examples');
  const examples = ['घर', 'घरमा', 'घरको', 'घरहरू', 'घरहरूमा', 'विद्यालयमा', 'विद्यालयले', 'साथीहरूसँग', 'आमा', 'सीमा', 'पाएको'];
  printTable(['Word', 'Stem', 'Times in corpora'], examples.map(w => [w, stem(w), fmtInt(formCounts.get(w) || 0)]));

  // A random sample of changed words, to check the stemmer by hand
  const rng = makeRng(20261110);
  const sample = shuffleInPlace([...changed].sort(), rng).slice(0, 300);
  const file = path.join(ensureOutputDir(), 'stem_check_sample.tsv');
  fs.writeFileSync(file, 'word\tstem\tcorrect? (y/n)\n' + sample.map(w => `${w}\t${stem(w)}\t`).join('\n') + '\n');
  heading('First 15 of 300 random changed words (check these by hand)');
  printTable(['Word', 'Stem'], sample.slice(0, 15).map(w => [w, stem(w)]));
  console.log(`\nWrote ${path.relative(process.cwd(), file)}: mark each row y or n to estimate the error rate.`);
}
