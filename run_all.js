'use strict';
/*
 * run_all.js
 * Runs every numbered script from 01 to 12 in order.
 *
 * INPUT
 *   The two corpus files (format described in 01_clean_corpus.js).
 *   Run:  node run_all.js [muna_corpus.txt] [yuba_manch_corpus.txt]
 *   Without paths the scripts read corpus/muna_corpus.txt and
 *   corpus/yuba_manch_corpus.txt. The paths are passed on to every script.
 *
 * OUTPUT
 *   Screen: everything each script prints, one after another, each under a
 *     line with its file name.
 *   Files:  every file the scripts write to output/.
 *   Stops at the first script that fails. Takes about 45 seconds; 07 and 08
 *   are the slow ones.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const scripts = [
  '01_clean_corpus', '02_tokenise', '03_stem',
  '04_type_token_ratio', '05_lexical_diversity', '06_length_control',
  '07_vocabulary_growth_hapax', '08_zipf_heaps', '09_frequency_bands',
  '10_word_origin', '11_keywords', '12_word_sentence_length',
];
for (const s of scripts) {
  console.log(`\n\n######## ${s}.js ########`);
  const r = spawnSync(process.execPath, [path.join(__dirname, `${s}.js`), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${s}.js stopped with an error.`); process.exit(r.status || 1); }
}
