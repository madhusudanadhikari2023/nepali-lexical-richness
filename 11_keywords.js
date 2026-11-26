'use strict';
/*
 * 11_keywords.js
 * Finds the keywords of each magazine: stems that are much more frequent in
 * one magazine than the corpus sizes would predict.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 11_keywords.js [muna_corpus.txt] [yuba_manch_corpus.txt] [--top 30]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   --top sets how many keywords are printed (default 30); the files hold all.
 *   Cleaning, tokenising and stemming are done first by 01, 02 and 03.
 *
 * OUTPUT
 *   Screen: for each magazine, the top keywords: rank, stem, times in each
 *     magazine, number of articles it appears in, log-likelihood (LL) and
 *     log ratio; then both corpus sizes.
 *   Files:  output/keywords_muna.csv and output/keywords_yuba_manch.csv, every
 *     keyword, columns: rank, stem, freq_own, freq_other, articles,
 *     log_likelihood, log_ratio
 *   Exports: none.
 *
 * METHOD
 *   For a stem seen a times in the target magazine (size Nt tokens) and
 *   b times in the other (size Nr):
 *     expected in target = Nt * (a + b) / (Nt + Nr), likewise for the other
 *     LL = 2 * (a * ln(a / expected_a) + b * ln(b / expected_b))
 *          (Dunning, 1993; Rayson & Garside, 2000)
 *     log ratio = log2 of (a / Nt) divided by (b / Nr), with 0.5 added to the
 *          counts to avoid dividing by zero; +1 means twice as frequent
 *   Only stems found in at least 8 articles of the target magazine count, so
 *   one long article cannot create a keyword. Keywords are ranked by LL.
 *
 * In the presentation: slide 13.
 */
const fs = require('fs');
const path = require('path');
const { loadStemmedCorpora } = require('./03_stem');
const { ensureOutputDir, parseArgs } = require('./01_clean_corpus');
const { heading, printTable, fmt, fmtInt } = require('./stats');

const MIN_ARTICLES = 8;

function logLikelihood(a, b, Nt, Nr) {
  const ea = Nt * (a + b) / (Nt + Nr), eb = Nr * (a + b) / (Nt + Nr);
  return 2 * ((a > 0 ? a * Math.log(a / ea) : 0) + (b > 0 ? b * Math.log(b / eb) : 0));
}

if (require.main === module) {
  const { flags } = parseArgs();
  const top = +(flags.top || 30);
  const { corpora } = loadStemmedCorpora();
  const counts = {}, articlesWith = {}, size = {};
  for (const key of ['muna', 'yuba']) {
    counts[key] = new Map(); articlesWith[key] = new Map(); size[key] = 0;
    for (const a of corpora[key].articles) {
      for (const s of a.stems) { counts[key].set(s, (counts[key].get(s) || 0) + 1); size[key]++; }
      for (const s of new Set(a.stems)) articlesWith[key].set(s, (articlesWith[key].get(s) || 0) + 1);
    }
  }
  const dir = ensureOutputDir();
  for (const [target, other] of [['muna', 'yuba'], ['yuba', 'muna']]) {
    const rows = [];
    for (const [stem, a] of counts[target]) {
      if (articlesWith[target].get(stem) < MIN_ARTICLES) continue;
      const b = counts[other].get(stem) || 0;
      const logRatio = Math.log2(((a + 0.5) / size[target]) / ((b + 0.5) / size[other]));
      if (logRatio > 0) rows.push({ stem, a, b, articles: articlesWith[target].get(stem), ll: Math.round(logLikelihood(a, b, size[target], size[other]) * 10) / 10, logRatio });
    }
    rows.sort((x, y) => y.ll - x.ll);
    heading(`Top ${top} keywords of ${corpora[target].name}`);
    printTable(['Rank', 'Stem', `Times in ${corpora[target].name}`, `Times in ${corpora[other].name}`, 'Articles', 'LL', 'Log ratio'],
      rows.slice(0, top).map((r, i) => [i + 1, r.stem, fmtInt(r.a), fmtInt(r.b), r.articles, fmt(r.ll, 1), fmt(r.logRatio, 2)]));
    const file = path.join(dir, `keywords_${target === 'muna' ? 'muna' : 'yuba_manch'}.csv`);
    fs.writeFileSync(file, '﻿rank,stem,freq_own,freq_other,articles,log_likelihood,log_ratio\n' + rows.map((r, i) => [i + 1, r.stem, r.a, r.b, r.articles, r.ll, r.logRatio.toFixed(3)].join(',')).join('\n') + '\n');
    console.log(`\nWrote ${path.relative(process.cwd(), file)} (${rows.length} keywords).`);
  }
  console.log(`\nCorpus sizes: Muna ${fmtInt(size.muna)} tokens, Yuba Manch ${fmtInt(size.yuba)}. Raw counts are not on the same scale; LL accounts for size.`);
}
