'use strict';
/*
 * 01_clean_corpus.js
 * Removes everything from the crawled pages that is not part of the article.
 *
 * INPUT
 *   Two corpus files made by the crawler, one per magazine. Plain UTF-8 text:
 *   one page per block, blocks separated by a line containing only "-----".
 *   Each block looks like this:
 *       ### TITLE: <article title>
 *       ### URL: <address of the page>
 *       <page text: header, article, footer>
 *   Run:  node 01_clean_corpus.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *
 * OUTPUT
 *   Screen: how many pages each cleaning rule touched, duplicates removed,
 *     pages per year (BS), and one article before and after cleaning.
 *   Files:  output/cleaned_muna.txt and output/cleaned_yuba.txt, in the same
 *     block format as the input but holding only the cleaned article text.
 *   Exports (used by the later scripts):
 *     loadCleanCorpora() -> { muna: CleanCorpus, yuba: CleanCorpus }
 *       CleanCorpus = { name: string, articles: Article[], tally: counts per rule }
 *       Article     = { title, url, author, date, year, raw, text }, all strings
 *                     (raw = page text before cleaning, text = after)
 *     cleanCorpus(filePath: string) -> { articles: Article[], tally }
 *     corpusPaths() -> { muna: string, yuba: string }  (from the command line)
 *     parseArgs()   -> { positional: string[], flags: { name: value } }
 *     helpers: strip, charLength, S, WS, NAMES, OUTPUT_DIR, ensureOutputDir
 *
 * METHOD
 *   1. Header: title again, author, date, share counter and font control.
 *   2. Footer: reaction counters and the lists of other headlines
 *      ("यो पनि हेर्नुहोस्", latest and popular news), which were the same on
 *      hundreds of pages.
 *   3. Signature: a line of up to 70 characters after the last । ? or !
 *   4. Duplicates: articles with the same first 300 characters.
 *   Encoding fixes: Unicode NFC, zero-width joiners removed, "¥" (left over
 *   from old font conversion) replaced with "र्".
 *
 * In the presentation: slide 5, step 2.
 */
const fs = require('fs');
const path = require('path');
const { heading, printTable, fmtInt } = require('./stats');

// ---------------------------------------------------------------------------
// Where the corpus files are. Pass them on the command line, or put them in
// ./corpus/ with these names.
// ---------------------------------------------------------------------------
function parseArgs(argv = process.argv.slice(2)) {
  const positional = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const name = argv[i].slice(2), next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[name] = next; i++; } else flags[name] = true;
    } else positional.push(argv[i]);
  }
  return { positional, flags };
}
function corpusPaths() {
  const { positional } = parseArgs();
  const paths = {
    muna: positional[0] || path.join(__dirname, 'corpus', 'muna_corpus.txt'),
    yuba: positional[1] || path.join(__dirname, 'corpus', 'yuba_manch_corpus.txt'),
  };
  for (const p of Object.values(paths)) {
    if (!fs.existsSync(p)) {
      console.error(`Corpus file not found: ${p}\nPut muna_corpus.txt and yuba_manch_corpus.txt in ./corpus/ or pass both paths:\n  node <script>.js path/to/muna_corpus.txt path/to/yuba_manch_corpus.txt`);
      process.exit(1);
    }
  }
  return paths;
}
const NAMES = { muna: 'Muna', yuba: 'Yuba Manch' };
const OUTPUT_DIR = path.join(__dirname, 'output');
function ensureOutputDir() { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); return OUTPUT_DIR; }

// ---------------------------------------------------------------------------
// Whitespace and digits written out in full, so every pattern below behaves
// the same in any JavaScript engine (and matches the original Python run).
// ---------------------------------------------------------------------------
const WS = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const S = `[${WS}]`;           // one whitespace character
const NS = `[^${WS}]`;         // one non-whitespace character
const COUNT = '[0-9\\u0966-\\u096F.,kK]'; // share and like counts: 12, १२, 1.2k

// The header: "... शेयर गर्नुहोस: 12 Shares फन्ट परिवर्तन गर्नुहोस: <author> शेयर गर्नुहोस: 12 Shares <date> <x y पहिले>"
const HEADER = new RegExp(
  `^([^\\n]*?)शेयर गर्नुहोस:${S}*${COUNT}*${S}*(?:Shares)?${S}*फन्ट परिवर्तन गर्नुहोस:${S}*([^\\n]*?)${S}*` +
  `शेयर गर्नुहोस:${S}*${COUNT}*${S}*(?:Shares)?${S}*(${NS}+ ${NS}+ ${NS}+ ${NS}+) (${NS}+ ${NS}+ पहिले)${S}*`);
// The footer starts at the reaction counters "12 LIKE 3 WOW ..." and runs to the end
const FOOTER = new RegExp(`${S}*${COUNT}+${S}*LIKE${S}*${COUNT}+${S}*WOW[\\s\\S]*$`);
const STRIP = new RegExp(`^${S}+|${S}+$`, 'g');
const strip = s => s.replace(STRIP, '');
const charLength = s => [...s].length;      // length in characters, not UTF-16 units

function cleanPage(page, tally) {
  const title = strip((page.match(/### TITLE: ([^\n]*)/) || [null, ''])[1]);
  const url = (page.match(new RegExp(`### URL: (${NS}+)`)) || [null, ''])[1];
  // the article text starts on the third line, after TITLE and URL
  const secondNewline = page.indexOf('\n', page.indexOf('\n') + 1);
  const raw = strip(page.slice(secondNewline + 1));

  // encoding fixes
  let text = raw.normalize('NFC');
  const yen = text.split('¥').length - 1;
  tally.yenFixed += yen;
  text = text.split('¥').join('र्');
  text = text.replace(/[‌‍﻿]/g, '').replace(/ /g, ' ');

  // 1. header
  let author = '', date = '';
  const h = HEADER.exec(text);
  if (h) { tally.header++; author = strip(h[2]); date = h[3]; text = text.slice(h[0].length); }

  // 2. footer
  let cut = text.replace(FOOTER, '');
  if (cut !== text) tally.footer++;
  else {                                     // fallback: cut at "यो पनि हेर्नुहोस्"
    const i = cut.lastIndexOf('यो पनि हेर्नुहोस्');
    if (i > 0) { cut = cut.slice(0, i); tally.footerFallback++; }
  }
  text = strip(cut);

  // 3. signature: up to 70 characters after the last । ? or !  (checked twice)
  for (let round = 0; round < 2; round++) {
    const last = Math.max(text.lastIndexOf('।'), text.lastIndexOf('?'), text.lastIndexOf('!'));
    if (last >= 0) {
      const tailLength = charLength(strip(text.slice(last + 1)));
      if (tailLength > 0 && tailLength <= 70) { text = text.slice(0, last + 1); tally.signature++; }
    }
  }

  const year = (date.match(/(२०[७८][0-9०-९])/) || [null, '?'])[1];
  return { title, url, author, date, year, raw, text };
}

function cleanCorpus(filePath) {
  const file = fs.readFileSync(filePath, 'utf8');
  const pages = file.split('\n-----\n').map(strip).filter(p => p.length > 0);
  const tally = { pages: pages.length, header: 0, footer: 0, footerFallback: 0, signature: 0, yenFixed: 0, duplicates: 0 };
  const cleaned = pages.map(p => cleanPage(p, tally));

  const years = {}, authors = {};
  for (const a of cleaned) { years[a.year] = (years[a.year] || 0) + 1; authors[a.author] = (authors[a.author] || 0) + 1; }
  tally.years = years;
  tally.staffByline = authors['गोरखापत्र अनलाइन'] || 0;

  // 4. duplicates: same first 300 characters
  const seen = new Set(), articles = [];
  for (const a of cleaned) {
    const key = [...a.text].slice(0, 300).join('');
    if (seen.has(key)) { tally.duplicates++; continue; }
    seen.add(key); articles.push(a);
  }
  tally.articles = articles.length;
  return { articles, tally };
}

function loadCleanCorpora() {
  const paths = corpusPaths(), out = {};
  for (const key of ['muna', 'yuba']) out[key] = { name: NAMES[key], ...cleanCorpus(paths[key]) };
  return out;
}

module.exports = { parseArgs, corpusPaths, loadCleanCorpora, cleanCorpus, NAMES, OUTPUT_DIR, ensureOutputDir, S, WS, strip, charLength };

// ---------------------------------------------------------------------------
// Run this file to see the outcome of the cleaning step
// ---------------------------------------------------------------------------
if (require.main === module) {
  const corpora = loadCleanCorpora();

  heading('Cleaning report');
  const t = k => [corpora.muna.tally[k], corpora.yuba.tally[k]].map(fmtInt);
  printTable(['', 'Muna', 'Yuba Manch'], [
    ['Pages crawled', ...t('pages')],
    ['Header removed', ...t('header')],
    ['Footer removed (reaction counters)', ...t('footer')],
    ['Footer removed (fallback marker)', ...t('footerFallback')],
    ['Signatures removed', ...t('signature')],
    ['"¥" replaced with "र्"', ...t('yenFixed')],
    ['Staff byline (गोरखापत्र अनलाइन)', ...t('staffByline')],
    ['Duplicates removed', ...t('duplicates')],
    ['Articles after cleaning', ...t('articles')],
  ]);

  heading('Pages by year of publication (BS)');
  const yearKeys = [...new Set([...Object.keys(corpora.muna.tally.years), ...Object.keys(corpora.yuba.tally.years)])].sort();
  printTable(['Year', 'Muna', 'Yuba Manch'], yearKeys.map(y => [y, corpora.muna.tally.years[y] || 0, corpora.yuba.tally.years[y] || 0]));

  heading('One article before and after cleaning');
  const a = corpora.muna.articles[1];
  const short = s => s.replace(/\s+/g, ' ');
  console.log(`Title: ${a.title}\n`);
  console.log(`BEFORE (start): ${short(a.raw).slice(0, 300)} ...`);
  console.log(`BEFORE (end):   ... ${short(a.raw).slice(-300)}\n`);
  console.log(`AFTER (start):  ${short(a.text).slice(0, 300)} ...`);
  console.log(`AFTER (end):    ... ${short(a.text).slice(-300)}`);
  console.log(`\nLength: ${fmtInt(charLength(a.raw))} characters before, ${fmtInt(charLength(a.text))} after.`);

  const dir = ensureOutputDir();
  for (const key of ['muna', 'yuba']) {
    const file = path.join(dir, `cleaned_${key}.txt`);
    fs.writeFileSync(file, corpora[key].articles.map(x => `### TITLE: ${x.title}\n### URL: ${x.url}\n${x.text}`).join('\n-----\n') + '\n');
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  }
}
