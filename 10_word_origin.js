'use strict';
/*
 * 10_word_origin.js
 * Compares where the words of each magazine come from (tatsama, native,
 * English or other loans) in a hand-coded random sample of running words.
 * Can also draw a new sample and write a coding template to fill in.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js), needed
 *   for the stemmer and for drawing samples.
 *   A sample file: JSON of the form { "muna": [words], "yuba": [words] }
 *     default data/origin_sample.json (the 800 + 800 words used for the slides)
 *   A coding sheet: tab-separated text with a header row and columns stem, code
 *     default data/origin_coding_sheet.tsv
 *     Codes:  T  Sanskritic (tatsama)          N  native (tadbhava, deshaj)
 *             E  English loan                  P  Perso-Arabic or other loan
 *             G  grammatical word              X  proper noun
 *             ?  unclear
 *     A lower-case letter (t, n, e, p) marks a technical or subject word.
 *   Run (analyse the slides' sample):
 *     node 10_word_origin.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Draw a new sample and get a coding template:
 *     node 10_word_origin.js --draw 800 [--seed 777]
 *   Analyse your own sample and codes:
 *     node 10_word_origin.js --sample output/origin_sample_new.json --codes my_codes.tsv
 *
 * OUTPUT
 *   Analyse mode (default), screen only:
 *     - count and share of every category among all sampled words
 *     - share of each origin among lexical words (T, N, E, P) for each
 *       magazine, with 95% Wilson intervals and a p-value per category
 *     - share of technical words, with interval and p
 *     - chi-square test of the whole distribution: chi-square, df, p, Cramer's V
 *     - a warning listing any sampled stems that have no code
 *   Draw mode (--draw n), files:
 *     output/origin_sample_new.json    the new sample, same format as the input
 *     output/origin_coding_template.tsv  columns: stem, code, times_in_sample,
 *       example_word; the code is filled in where the old sheet has one
 *   Exports: none.
 *
 * METHOD
 *   Each sampled word is stemmed (03_stem.js) and looked up in the coding
 *   sheet. Grammatical words, proper nouns and unclear words are left out of
 *   the shares, so the shares are among lexical words only. Differences per
 *   category use a two-proportion z-test; the whole 2 x 4 table uses a
 *   chi-square test.
 *
 * In the presentation: slide 12.
 */
const fs = require('fs');
const path = require('path');
const { loadStemmedCorpora } = require('./03_stem');
const { ensureOutputDir, parseArgs } = require('./01_clean_corpus');
const { makeRng, heading, printTable, wilsonCI, twoProportionTest, chiSquareTest, fmt, fmtPct, fmtP } = require('./stats');

const CATEGORIES = { T: 'Sanskritic (tatsama)', N: 'Native (tadbhava, deshaj)', E: 'English loan', P: 'Perso-Arabic or other loan', G: 'Grammatical word', X: 'Proper noun', '?': 'Unclear' };
const LEXICAL = ['N', 'T', 'E', 'P'];

function readCodes(file) {
  const codes = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const [stem, code] = line.split('\t');
    if (stem && code && code.trim()) codes.set(stem.trim(), code.trim());
  }
  return codes;
}

function drawSample(corpora, stem, size, seed, codesFile) {
  const rng = makeRng(seed), sample = {};
  for (const key of ['muna', 'yuba']) {
    const flat = corpora[key].articles.flatMap(a => a.tokens);
    const picked = new Set();
    while (picked.size < size) picked.add(rng.int(flat.length));   // without replacement
    sample[key] = [...picked].map(i => flat[i]);
  }
  const known = fs.existsSync(codesFile) ? readCodes(codesFile) : new Map();
  const stems = new Map();
  for (const key of ['muna', 'yuba']) for (const w of sample[key]) { const s = stem(w); const e = stems.get(s) || { n: 0, example: w }; e.n++; stems.set(s, e); }
  const dir = ensureOutputDir();
  fs.writeFileSync(path.join(dir, 'origin_sample_new.json'), JSON.stringify(sample, null, 1));
  const rows = [...stems.entries()].sort((a, b) => b[1].n - a[1].n);
  fs.writeFileSync(path.join(dir, 'origin_coding_template.tsv'),
    'stem\tcode\ttimes_in_sample\texample_word\n' + rows.map(([s, e]) => `${s}\t${known.get(s) || ''}\t${e.n}\t${e.example}`).join('\n') + '\n');
  const todo = rows.filter(([s]) => !known.has(s)).length;
  console.log(`Drew ${size} tokens from each magazine (${stems.size} different stems, ${todo} without a code yet).`);
  console.log('Wrote output/origin_sample_new.json and output/origin_coding_template.tsv.');
  console.log('Fill in the code column, then run:');
  console.log('  node 10_word_origin.js --sample output/origin_sample_new.json --codes output/origin_coding_template.tsv');
}

if (require.main === module) {
  const { flags } = parseArgs();
  const { corpora, stem } = loadStemmedCorpora();
  const codesFile = flags.codes || path.join(__dirname, 'data', 'origin_coding_sheet.tsv');
  if (flags.draw) { drawSample(corpora, stem, flags.draw === true ? 800 : +flags.draw, +(flags.seed || 777), codesFile); process.exit(0); }

  const sample = JSON.parse(fs.readFileSync(flags.sample || path.join(__dirname, 'data', 'origin_sample.json'), 'utf8'));
  const codes = readCodes(codesFile);
  const tally = {}, missing = new Set();
  for (const key of ['muna', 'yuba']) {
    const t = { total: sample[key].length, technical: 0 };
    for (const k of Object.keys(CATEGORIES)) t[k] = 0;
    for (const w of sample[key]) {
      const code = codes.get(stem(w));
      if (!code) { missing.add(stem(w)); continue; }
      const cat = code.toUpperCase();
      if (!(cat in CATEGORIES)) { missing.add(stem(w)); continue; }
      t[cat]++;
      if (code !== cat) t.technical++;             // lower-case letter = technical word
    }
    t.lexical = LEXICAL.reduce((s, k) => s + t[k], 0);
    tally[key] = t;
  }
  if (missing.size) console.log(`Warning: ${missing.size} stems in the sample have no valid code and were skipped: ${[...missing].slice(0, 20).join(', ')}${missing.size > 20 ? ' ...' : ''}\n`);
  const M = tally.muna, Y = tally.yuba;

  heading('All sampled tokens');
  printTable(['Category', 'Muna', 'Yuba Manch'], Object.entries(CATEGORIES).map(([k, label]) => [label, `${M[k]} (${fmtPct(M[k] / M.total)})`, `${Y[k]} (${fmtPct(Y[k] / Y.total)})`]));

  heading(`Origin of lexical words (Muna n = ${M.lexical}, Yuba Manch n = ${Y.lexical})`);
  const ci = (k, n) => { const c = wilsonCI(k, n); return `${fmtPct(k / n)} [${fmt(100 * c[0], 1)}, ${fmt(100 * c[1], 1)}]`; };
  const rows = LEXICAL.map(k => [CATEGORIES[k], ci(M[k], M.lexical), ci(Y[k], Y.lexical), fmtP(twoProportionTest(M[k], M.lexical, Y[k], Y.lexical).p)]);
  rows.push(['Technical or subject-specific', ci(M.technical, M.lexical), ci(Y.technical, Y.lexical), fmtP(twoProportionTest(M.technical, M.lexical, Y.technical, Y.lexical).p)]);
  printTable(['Category', 'Muna (share, 95% Wilson CI)', 'Yuba Manch', 'p'], rows);

  const chi = chiSquareTest([LEXICAL.map(k => M[k]), LEXICAL.map(k => Y[k])]);
  console.log(`\nWhole distribution: chi-square = ${fmt(chi.chi2, 1)}, df = ${chi.df}, p ${fmtP(chi.p).startsWith('<') ? fmtP(chi.p) : '= ' + fmtP(chi.p)}, Cramer's V = ${fmt(chi.cramerV, 2)} (0.1 small, 0.3 medium, 0.5 large).`);
  console.log('These shares are only as good as the codes in the coding sheet: check them against a dictionary.');
}
