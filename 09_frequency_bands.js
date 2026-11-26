'use strict';
/*
 * 09_frequency_bands.js
 * Sorts the vocabulary into high-, middle- and low-frequency bands and
 * measures how much of each article's text comes from each band.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node 09_frequency_bands.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths it reads corpus/muna_corpus.txt and corpus/yuba_manch_corpus.txt.
 *   Cleaning, tokenising and stemming are done first by 01, 02 and 03.
 *
 * OUTPUT
 *   Screen only:
 *     - for each band, the mean share of an article's words in that band for
 *       each magazine (with 95% bootstrap interval), the difference in
 *       percentage points, Cohen's d and p
 *     - coverage: the share of all running words covered by the 100, 500,
 *       1,000, 2,000, 5,000 and 10,000 most frequent stems
 *     - how many stems Yuba Manch needs to match the coverage that 5,000
 *       stems give in Muna
 *   Files:  none.   Exports: none.
 *
 * METHOD
 *   1. Rank every stem by how common it is across both magazines. Each
 *      magazine counts equally: relative frequency = (share in Muna + share
 *      in Yuba Manch) / 2, so the larger corpus does not dominate.
 *   2. Ranks 1 to 1,000 = high band, 1,001 to 5,000 = middle, the rest = low.
 *   3. For each article: what share of its words falls in each band?
 *   The bands come from these two magazines, not from an independent
 *   frequency list, so they show relative position, not absolute difficulty.
 *
 * In the presentation: slide 11.
 */
const { loadStemmedCorpora } = require('./03_stem');
const { compareGroups, makeRng, heading, printTable, fmt, fmtInt, fmtPct, fmtP } = require('./stats');

if (require.main === module) {
  const { corpora } = loadStemmedCorpora();
  const rng = makeRng(20261110);

  // 1. counts and ranking
  const counts = { muna: new Map(), yuba: new Map() }, totals = { muna: 0, yuba: 0 }, allStems = new Map();
  for (const key of ['muna', 'yuba']) for (const a of corpora[key].articles) for (const s of a.stems) {
    counts[key].set(s, (counts[key].get(s) || 0) + 1); totals[key]++; allStems.set(s, true);
  }
  const rel = s => ((counts.muna.get(s) || 0) / totals.muna + (counts.yuba.get(s) || 0) / totals.yuba) / 2;
  const ranked = [...allStems.keys()].map(s => [s, rel(s)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const rank = new Map(ranked.map((s, i) => [s, i + 1]));

  // 2. bands
  const BANDS = [['High (ranks 1 to 1,000)', 1, 1000], ['Middle (1,001 to 5,000)', 1001, 5000], ['Low (5,001 and above)', 5001, Infinity]];
  const bandOf = s => { const r = rank.get(s); return r <= 1000 ? 0 : r <= 5000 ? 1 : 2; };

  // 3. share of each article's words in each band
  const shares = key => corpora[key].articles.map(a => { const n = [0, 0, 0]; for (const s of a.stems) n[bandOf(s)]++; return n.map(v => v / a.stems.length); });
  const m = shares('muna'), y = shares('yuba');

  heading("Share of an article's words in each frequency band");
  const rows = BANDS.map(([label], b) => {
    const c = compareGroups(m.map(r => r[b]), y.map(r => r[b]), rng);
    return [label, `${fmtPct(c.muna.mean)} [${fmtPct(c.muna.ci[0])}, ${fmtPct(c.muna.ci[1])}]`, `${fmtPct(c.yuba.mean)} [${fmtPct(c.yuba.ci[0])}, ${fmtPct(c.yuba.ci[1])}]`,
      `${fmt(100 * c.diff, 1)} points`, fmt(c.d, 2), fmtP(c.p)];
  });
  printTable(['Band', 'Muna (mean, 95% CI)', 'Yuba Manch', 'Difference', "Cohen's d", 'p'], rows);

  heading('Coverage: share of all running words covered by the most frequent stems');
  const coverage = (key, k) => { let s = 0; for (const st of ranked.slice(0, k)) s += counts[key].get(st) || 0; return s / totals[key]; };
  printTable(['Most frequent stems', 'Muna', 'Yuba Manch'], [100, 500, 1000, 2000, 5000, 10000].map(k => [fmtInt(k), fmtPct(coverage('muna', k)), fmtPct(coverage('yuba', k))]));

  // how many stems a Yuba Manch reader needs for the coverage 5,000 stems give in Muna
  const target = coverage('muna', 5000);
  let covered = 0, needed = 0;
  for (const st of ranked) { covered += counts.yuba.get(st) || 0; needed++; if (covered / totals.yuba >= target) break; }
  console.log(`\nThe 5,000 most frequent stems cover ${fmtPct(target)} of Muna. Yuba Manch needs ${fmtInt(needed)} stems for the same coverage.`);
  console.log('These bands come from the two magazines themselves, so they show relative position, not absolute difficulty.');
}
