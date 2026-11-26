# Lexical richness in Muna and Yuba Manch: JavaScript scripts

Node.js scripts that take the two crawled corpus files and run each step of the analysis, from cleaning the pages to comparing the vocabulary of the two magazines. Each script prints its results, and some also write files to `output/`.

Every script starts with a comment that sets out its input, its output and its method.

## Requirements

Node.js 16 or later (tested with Node 22). Nothing to install.

## Setup

Put the two corpus files in a folder called `corpus` next to the scripts:

```
corpus/muna_corpus.txt
corpus/yuba_manch_corpus.txt
```

Or pass the paths to any script:

```
node 05_lexical_diversity.js path/to/muna_corpus.txt path/to/yuba_manch_corpus.txt
```

`node run_all.js` runs everything in order (about 45 seconds).

## Input format

Each corpus file is plain UTF-8 text from the crawler: one page per block, blocks separated by a line containing only `-----`. Each block starts with `### TITLE: <title>` and `### URL: <address>`, followed by the page text.

## The scripts

Numbered in the order they run. Each later script reuses the earlier ones, so every script can also be run on its own.

| Script | What it does | Prints | Writes | Slide |
| --- | --- | --- | --- | --- |
| `01_clean_corpus.js` | Removes page headers, footers, signatures and duplicates | Pages touched by each rule; one article before and after | `cleaned_muna.txt`, `cleaned_yuba.txt` | 5 |
| `02_tokenise.js` | Splits text into word tokens and sentences; drops articles under 100 tokens | Articles, tokens, types, sentences, article lengths | | 4, 5 |
| `03_stem.js` | Strips attached postpositions, particles and the plural marker | Word forms merged, examples | `stem_check_sample.tsv` | 5 |
| `04_type_token_ratio.js` | Type-token ratio per article | TTR and article length per magazine | | 6 |
| `05_lexical_diversity.js` | MATTR, MTLD and HD-D per article | Means, intervals, differences, effect sizes, p | `per_article_measures.csv` | 7 |
| `06_length_control.js` | Checks whether the diversity differences are just article length | Correlations, first-300-words check, regression | | 8 |
| `07_vocabulary_growth_hapax.js` | Types and hapax legomena in equal 100,000-token samples | Types, hapax share, hapax per 100 tokens | `vocabulary_growth_curve.csv` | 9 |
| `08_zipf_heaps.js` | Fits Zipf's law and Heaps' law in the same samples | Heaps' beta and K, Zipf slopes, top-word coverage | | 10 |
| `09_frequency_bands.js` | Share of each article's words in high, middle and low frequency bands | Band shares, coverage of the top stems | | 11 |
| `10_word_origin.js` | Tatsama, native, English and other loan shares in a coded sample | Shares, intervals, chi-square | with `--draw`: a new sample and coding template | 12 |
| `11_keywords.js` | Keywords of each magazine by log-likelihood | Top keywords with frequencies and scores | `keywords_muna.csv`, `keywords_yuba_manch.csv` | 13 |
| `12_word_sentence_length.js` | Word length in aksharas and sentence length | Means, differences, p before and after length control | | 14 |
| `stats.js` | Shared statistics: bootstrap, permutation test, effect sizes, regression, p-values | Not run on its own | | |
| `run_all.js` | Runs 01 to 12 in order | Everything above | Everything above | |

The crawler itself is not included: the scripts start from its output files.

## Options

- `07` and `08`: `--tokens 100000 --reps 500 --perms 1000` (sample size, number of samples, number of label shuffles)
- `11`: `--top 30` (how many keywords to print)
- `10`: `--draw 800` draws a new random sample and writes a coding template to fill in; `--sample <file> --codes <file>` analyses your own sample and codes

## Word-origin data

`data/origin_sample.json` holds the 800 + 800 sampled words used for slide 12, and `data/origin_coding_sheet.tsv` holds their codes. The codes are a first pass and should be checked against a dictionary. Codes: T tatsama, N native, E English, P other loan, G grammatical, X proper noun, ? unclear; a lower-case letter marks a technical word.

## About the numbers

- Results with no randomness (counts, TTR, MATTR, MTLD, HD-D, effect sizes, regressions, bands, keywords, word origin) match the presentation exactly.
- Bootstrap intervals, permutation p-values and the samples in `07` and `08` use a fixed seed, so every run prints the same numbers. They can differ slightly from the slides, which came from an earlier run with a different random generator. For example, slide 9 says 20,204 word types for Muna and `07` prints 20,196.
- Devanagari prints correctly in most terminals. On Windows, use Windows Terminal or the VS Code terminal.
