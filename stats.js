'use strict';
/*
 * stats.js
 * Shared statistics and printing helpers used by all the numbered scripts.
 * Not run on its own. No packages needed: everything is written out here.
 *
 * INPUT
 *   Arrays of numbers passed in by the other scripts, usually one value per
 *   article (a for Muna, b for Yuba Manch), plus a random number generator
 *   made with makeRng(seed) so that every run gives the same result.
 *
 * OUTPUT (exported functions)
 *   Random numbers
 *     makeRng(seed) -> rng(): number in [0, 1); rng.uint32(); rng.int(n)
 *     shuffleInPlace(array, rng) -> the same array, shuffled
 *   Descriptive statistics, each -> number
 *     sum(x), mean(x), sd(x), median(x), percentile(x, p), correlation(x, y)
 *   Effect sizes, each -> number, positive when b (Yuba Manch) is higher
 *     cohenD(a, b), cliffDelta(a, b)
 *   Resampling
 *     bootstrapCI(x, rng, B = 5000) -> [low, high], 95% interval of the mean
 *     bootstrapDiffCI(a, b, rng, B = 5000) -> [low, high], interval of mean(b) - mean(a)
 *     permutationP(a, b, rng, B = 10000) -> p-value from shuffling the labels
 *     compareGroups(a, b, rng) -> { muna: { n, mean, sd, median, ci },
 *                                   yuba: { ... }, diff, diffCI, p, d, cliff }
 *   Fitting
 *     linearFit(x, y) -> { slope, intercept }
 *     ols(X, y) -> { coef, se, t, p, df, residualSD }  (X = rows of predictors)
 *   Tests and p-values
 *     tTwoSidedP(t, df), chiSquareP(chi2, df), normalTwoSidedP(z) -> p-value
 *     wilsonCI(k, n) -> [low, high], 95% interval of a proportion
 *     twoProportionTest(k1, n1, k2, n2) -> { z, p }
 *     chiSquareTest(table of counts) -> { chi2, df, p, cramerV }
 *   Printing
 *     fmt(x, decimals), fmtInt(x), fmtPct(x), fmtP(p), fmtCI(ci) -> string
 *     printTable(headers, rows), heading(text) -> print to the screen
 */

// ---------------------------------------------------------------------------
// Random numbers. A fixed seed makes every run give the same answer.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let state = seed >>> 0;
  function nextUint32() {            // mulberry32 generator
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  const rng = () => nextUint32() / 4294967296; // a number in [0, 1)
  rng.uint32 = nextUint32;
  rng.int = n => Math.floor(rng() * n);        // a whole number in [0, n)
  return rng;
}

function shuffleInPlace(arr, rng) {           // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------
function sum(x) { let s = 0; for (const v of x) s += v; return s; }
function mean(x) { return sum(x) / x.length; }
function sd(x) {                              // sample standard deviation (n - 1)
  const m = mean(x); let s = 0;
  for (const v of x) s += (v - m) * (v - m);
  return Math.sqrt(s / (x.length - 1));
}
function percentile(x, p) {                   // same rule as NumPy's default
  const s = Float64Array.from(x).sort();
  const pos = (s.length - 1) * p / 100;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function median(x) { return percentile(x, 50); }
function correlation(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// ---------------------------------------------------------------------------
// Effect sizes. Positive = the second group (Yuba Manch) is higher.
// ---------------------------------------------------------------------------
function cohenD(a, b) {
  const na = a.length, nb = b.length;
  const pooled = Math.sqrt(((na - 1) * sd(a) ** 2 + (nb - 1) * sd(b) ** 2) / (na + nb - 2));
  return (mean(b) - mean(a)) / pooled;
}
function countBelow(sorted, v) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } return lo; }
function countAtOrBelow(sorted, v) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; } return lo; }
function cliffDelta(a, b) {                   // P(b > a) - P(b < a)
  const s = Float64Array.from(a).sort(); let gt = 0, lt = 0;
  for (const v of b) { gt += countBelow(s, v); lt += s.length - countAtOrBelow(s, v); }
  return (gt - lt) / (a.length * b.length);
}

// ---------------------------------------------------------------------------
// Bootstrap and permutation test
// ---------------------------------------------------------------------------
function bootstrapMeans(x, rng, B) {
  const n = x.length, out = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[Math.floor(rng() * n)];
    out[b] = s / n;
  }
  return out;
}
// 95% interval for a mean: resample the articles B times, keep the middle 95%
function bootstrapCI(x, rng, B = 5000) {
  const m = bootstrapMeans(x, rng, B);
  return [percentile(m, 2.5), percentile(m, 97.5)];
}
// 95% interval for the difference of two means (b minus a)
function bootstrapDiffCI(a, b, rng, B = 5000) {
  const mb = bootstrapMeans(b, rng, B), ma = bootstrapMeans(a, rng, B);
  const d = mb.map((v, i) => v - ma[i]);
  return [percentile(d, 2.5), percentile(d, 97.5)];
}
// Shuffle the magazine labels B times; p = share of shuffles with a gap
// at least as large as the real one
function permutationP(a, b, rng, B = 10000) {
  const z = Float64Array.from([...a, ...b]);
  const na = a.length, nb = b.length, total = sum(z);
  const observed = Math.abs(mean(b) - mean(a));
  let count = 0;
  for (let r = 0; r < B; r++) {
    shuffleInPlace(z, rng);
    let sa = 0; for (let i = 0; i < na; i++) sa += z[i];
    if (Math.abs((total - sa) / nb - sa / na) >= observed - 1e-12) count++;
  }
  return (count + 1) / (B + 1);
}

// Everything the slides report for one measure, Muna (a) against Yuba Manch (b)
function compareGroups(a, b, rng, { boot = 5000, perms = 10000 } = {}) {
  a = a.filter(Number.isFinite); b = b.filter(Number.isFinite);
  const describe = x => ({ n: x.length, mean: mean(x), sd: sd(x), median: median(x), ci: bootstrapCI(x, rng, boot) });
  return {
    muna: describe(a), yuba: describe(b),
    diff: mean(b) - mean(a), diffCI: bootstrapDiffCI(a, b, rng, boot),
    p: permutationP(a, b, rng, perms), d: cohenD(a, b), cliff: cliffDelta(a, b),
  };
}

// ---------------------------------------------------------------------------
// Straight-line fit and multiple regression
// ---------------------------------------------------------------------------
function linearFit(x, y) {                    // y = intercept + slope * x
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}
function invert(M) {                          // Gauss-Jordan inverse of a small matrix
  const n = M.length, A = M.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map(row => row.slice(n));
}
// Ordinary least squares. X = rows of predictors (include a 1 for the intercept).
function ols(X, y) {
  const n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => { let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * X[r][j]; return s; }));
  const Xty = Array.from({ length: k }, (_, i) => { let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * y[r]; return s; });
  const inv = invert(XtX);
  const coef = inv.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
  let rss = 0; for (let r = 0; r < n; r++) { const fit = X[r].reduce((s, v, j) => s + v * coef[j], 0); rss += (y[r] - fit) ** 2; }
  const df = n - k, residualVariance = rss / df;
  const se = inv.map((row, i) => Math.sqrt(residualVariance * row[i]));
  const t = coef.map((b, i) => b / se[i]);
  const p = t.map(v => tTwoSidedP(v, df));
  return { coef, se, t, p, df, residualSD: Math.sqrt(residualVariance) };
}

// ---------------------------------------------------------------------------
// p-values from the t, chi-square and normal distributions
// ---------------------------------------------------------------------------
function logGamma(x) {                        // Lanczos approximation
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015; for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function upperIncompleteGamma(a, x) {         // regularized Q(a, x)
  if (x <= 0) return 1;
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {                            // series
    let ap = a, del = 1 / a, s = del;
    for (let i = 0; i < 10000; i++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
    return 1 - s * front;
  }
  const TINY = 1e-300;                         // continued fraction
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return front * h;
}
function betaContinuedFraction(a, b, x) {
  const TINY = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
function incompleteBeta(a, b, x) {           // regularized I_x(a, b)
  if (x <= 0) return 0; if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? front * betaContinuedFraction(a, b, x) / a
                                   : 1 - front * betaContinuedFraction(b, a, 1 - x) / b;
}
function tTwoSidedP(t, df) { return incompleteBeta(df / 2, 0.5, df / (df + t * t)); }
function chiSquareP(chi2, df) { return upperIncompleteGamma(df / 2, chi2 / 2); }
function normalTwoSidedP(z) { return upperIncompleteGamma(0.5, z * z / 2); }

// Wilson 95% interval for a proportion k out of n
function wilsonCI(k, n) {
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [centre - half, centre + half];
}
// Two-proportion z-test (k1 of n1 against k2 of n2)
function twoProportionTest(k1, n1, k2, n2) {
  const p = (k1 + k2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = (k2 / n2 - k1 / n1) / se;
  return { z, p: normalTwoSidedP(z) };
}
// Chi-square test of independence for a table of counts
function chiSquareTest(table) {
  const rows = table.map(sum), cols = table[0].map((_, j) => sum(table.map(r => r[j]))), total = sum(rows);
  let chi2 = 0;
  table.forEach((r, i) => r.forEach((o, j) => { const e = rows[i] * cols[j] / total; chi2 += (o - e) ** 2 / e; }));
  const df = (rows.length - 1) * (cols.length - 1);
  const cramerV = Math.sqrt(chi2 / (total * Math.min(rows.length - 1, cols.length - 1)));
  return { chi2, df, p: chiSquareP(chi2, df), cramerV };
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const fmtInt = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtPct = (x, d = 1) => (100 * x).toFixed(d) + '%';
const fmtP = p => (p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0/, ''));
const fmtCI = (ci, d = 3) => `[${fmt(ci[0], d)}, ${fmt(ci[1], d)}]`;

function printTable(headers, rows) {
  const cells = [headers, ...rows].map(r => r.map(String));
  const width = headers.map((_, j) => Math.max(...cells.map(r => [...r[j]].length)));
  const line = r => r.map((c, j) => c + ' '.repeat(width[j] - [...c].length)).join('  ');
  console.log(line(cells[0]));
  console.log(width.map(w => '-'.repeat(w)).join('  '));
  cells.slice(1).forEach(r => console.log(line(r)));
}
function heading(text) { console.log('\n' + text + '\n' + '='.repeat([...text].length)); }

module.exports = {
  makeRng, shuffleInPlace, sum, mean, sd, median, percentile, correlation,
  cohenD, cliffDelta, bootstrapCI, bootstrapDiffCI, permutationP, compareGroups,
  linearFit, ols, tTwoSidedP, chiSquareP, normalTwoSidedP, wilsonCI, twoProportionTest, chiSquareTest,
  fmt, fmtInt, fmtPct, fmtP, fmtCI, printTable, heading,
};
