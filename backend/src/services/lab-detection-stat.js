/**
 * Contrôles STAT (exercice N) — lot 1 : STAT-01 Benford 1er chiffre.
 * Pas de STAT-03/04/05/07 (historique / multi-exercices).
 */

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** @typedef {{ code: string, famille: 'STAT', gravite: 2, motif: string, lines: object[] }} StatAlert */

const GRAVITE_STAT = 2;
const STAT_FAMILLES = Object.freeze(['ACH', 'VEN', 'BQ', 'CAI', 'OD']);

/** Probabilités Benford P(d) = log10(1 + 1/d), d = 1..9 */
const BENFORD_P = Object.freeze(
  Array.from({ length: 9 }, (_, i) => {
    const d = i + 1;
    return Math.log10(1 + 1 / d);
  }),
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const journalsPath = path.join(__dirname, 'lab-detection-journals.js');

/**
 * @param {unknown} code
 * @param {unknown} [lib]
 * @returns {'ACH'|'VEN'|'BQ'|'CAI'|'OD'|'AN'|'OTHER'}
 */
function classifyJournalMinimal(code, lib) {
  const c = String(code ?? '').trim().toUpperCase();
  const l = String(lib ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (c === 'CA') {
    if (l.includes('CAISSE')) return 'CAI';
    if (l.includes('CREDIT AGRICOLE') || l.includes('BANQUE') || l.includes('CRCA')) return 'BQ';
    return 'OTHER';
  }
  if (['AC', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'HA', '40', '60'].includes(c)) return 'ACH';
  if (['VE', 'VT', 'V1', 'V2', 'V3', 'V4', 'VA', 'VM', '70', '41', '00'].includes(c)) return 'VEN';
  if (/^B[0-9QPN]$/.test(c) || ['BQ', 'BP', 'BN', 'BB', 'BE', 'BA', 'CM', 'CC'].includes(c)) return 'BQ';
  if (['C1', 'C3'].includes(c) || l.includes('CAISSE')) return 'CAI';
  if (['OD', 'O1', 'O2', 'OC', 'TV', 'PA', '49', 'EX', 'RE'].includes(c)) return 'OD';
  if (['AN', '20', '10'].includes(c)) return 'AN';
  return 'OTHER';
}

/** @type {(code: unknown, lib?: unknown) => string} */
let classifyJournal = classifyJournalMinimal;
if (existsSync(journalsPath)) {
  const mod = await import('./lab-detection-journals.js');
  classifyJournal = mod.classifyJournal;
}

/** @param {unknown} v @returns {number} */
function toAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Montant absolu utile Benford (Debit ou Credit).
 * @param {object} row
 * @returns {number}
 */
function absoluteAmount(row) {
  if (row?.montant != null && Number.isFinite(Number(row.montant)) && Number(row.montant) !== 0) {
    return Math.abs(Number(row.montant));
  }
  const d = toAmount(row?.Debit);
  const c = toAmount(row?.Credit);
  if (d !== 0) return Math.abs(d);
  if (c !== 0) return Math.abs(c);
  return 0;
}

/**
 * Premier chiffre significatif (1–9), ou null.
 * @param {number} amount
 * @returns {number|null}
 */
export function firstSignificantDigit(amount) {
  const a = Math.abs(Number(amount));
  if (!Number.isFinite(a) || a < 1e-12) return null;
  // Mantisse scientifique : "4.12e+3" → premier chiffre = 4
  const sci = a.toExponential();
  const lead = Number(sci[0]);
  if (lead >= 1 && lead <= 9) return lead;
  let x = a;
  while (x >= 10) x /= 10;
  while (x > 0 && x < 1) x *= 10;
  const digit = Math.floor(x + 1e-12);
  return digit >= 1 && digit <= 9 ? digit : null;
}

/**
 * MAD Benford (écart absolu moyen sur les 9 digits).
 * @param {number[]} counts index 0 = digit 1 … index 8 = digit 9
 * @param {number} n
 * @returns {number}
 */
export function benfordMad(counts, n) {
  if (!n || n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const obs = (counts[i] || 0) / n;
    sum += Math.abs(obs - BENFORD_P[i]);
  }
  return sum / 9;
}

/**
 * STAT-01 — Benford 1er chiffre par famille de journal.
 * Skip si < minLines (défaut 500). Non-conforme si MAD > madThreshold (défaut 0.015).
 *
 * @param {object[]} rows
 * @param {{
 *   madThreshold?: number,
 *   minLines?: number,
 *   familles?: string[],
 * }} [opts]
 * @returns {StatAlert[]}
 */
function controlStat01(rows, opts = {}) {
  const madThreshold = Number(opts.madThreshold) > 0 ? Number(opts.madThreshold) : 0.015;
  const minLines = Number(opts.minLines) > 0 ? Number(opts.minLines) : 500;
  const familles = (opts.familles && opts.familles.length)
    ? opts.familles.map((f) => String(f).toUpperCase())
    : [...STAT_FAMILLES];

  /** @type {Map<string, { counts: number[], n: number }>} */
  const byFam = new Map();
  for (const fam of familles) {
    byFam.set(fam, { counts: Array(9).fill(0), n: 0 });
  }

  for (const row of rows) {
    const fam = classifyJournal(row.JournalCode, row.JournalLib);
    if (!byFam.has(fam)) continue;
    const amt = absoluteAmount(row);
    const digit = firstSignificantDigit(amt);
    if (digit == null) continue;
    const bucket = byFam.get(fam);
    bucket.counts[digit - 1] += 1;
    bucket.n += 1;
  }

  /** @type {StatAlert[]} */
  const alerts = [];
  for (const fam of familles) {
    const bucket = byFam.get(fam);
    if (!bucket || bucket.n < minLines) continue;
    const mad = benfordMad(bucket.counts, bucket.n);
    if (mad <= madThreshold) continue;

    const dist = bucket.counts.map((c, i) => ({
      digit: i + 1,
      obs: +(c / bucket.n).toFixed(4),
      benford: +BENFORD_P[i].toFixed(4),
      count: c,
    }));

    // Une seule ligne synthèse / famille (pas d'échantillon de 30 écritures)
    alerts.push({
      code: 'STAT-01',
      famille: 'STAT',
      gravite: GRAVITE_STAT,
      motif: `Benford 1er chiffre non conforme — journal ${fam} (MAD ${mad.toFixed(4)} > ${madThreshold}, n=${bucket.n})`,
      lines: [
        {
          Idlig: null,
          EcritureNum: null,
          EcritureDate: null,
          JournalCode: fam,
          CompteNum: null,
          montant: mad,
          EcritureLib: `MAD=${mad.toFixed(4)} | n=${bucket.n} | seuil=${madThreshold} | dist=${JSON.stringify(dist)}`,
          mad,
          n: bucket.n,
          familleJournal: fam,
          distribution: dist,
        },
      ],
    });
  }

  return alerts;
}

/**
 * Exécute les contrôles STAT lot 1 (STAT-01 uniquement).
 * @param {object[]} rows
 * @param {{
 *   madThreshold?: number,
 *   minLines?: number,
 *   familles?: string[],
 *   codes?: string[],
 * }} [opts]
 * @returns {StatAlert[]}
 */
export function runStatControls(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = opts.codes
    ? new Set(opts.codes.map((c) => String(c).toUpperCase()))
    : null;

  /** @type {StatAlert[]} */
  const alerts = [];
  if (!wanted || wanted.has('STAT-01')) {
    alerts.push(...controlStat01(list, opts));
  }
  return alerts;
}

export const STAT_CODES = Object.freeze(['STAT-01']);
export { BENFORD_P, STAT_FAMILLES };
