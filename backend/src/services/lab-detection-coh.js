/**
 * Contrôles de cohérence FEC (famille COH) — esprit Caseware / Excel Controles_comptables.
 * Pas de tests week-end/férié, Benford, caisse, CCA (LCB / STAT).
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOURNALS_PATH = join(__dirname, 'lab-detection-journals.js');

/** Pas de plafond : le collab doit voir toutes les alertes (UI accordéon). */
const SEUIL_EUR_DEFAULT = 6000;
const FAMILLE = 'COH';
const GRAVITE = 1;

/**
 * Classify minimal si lab-detection-journals.js absent.
 * @param {unknown} code
 * @param {unknown} [lib]
 * @returns {'ACH'|'VEN'|'BQ'|'CAI'|'OD'|'AN'|'OTHER'}
 */
function classifyJournalLocal(code, lib) {
  const c = String(code ?? '').trim().toUpperCase();
  const l = String(lib ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (c === 'CA') {
    if (l.includes('CAISSE')) return 'CAI';
    if (l.includes('CREDIT AGRICOLE') || l.includes('CRCA') || l.includes('BANQUE')) return 'BQ';
    return 'OTHER';
  }
  if (['AC', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'HA', '40', '60'].includes(c)) return 'ACH';
  if (['VE', 'VT', 'V1', 'V2', 'V3', 'V4', 'VA', 'VM', '70', '41', '00'].includes(c)) return 'VEN';
  if (['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'BQ', 'BP', 'BN', 'BB', 'BE', 'BA', 'CM', 'BC', 'BF', 'CB', 'CC', 'BH'].includes(c)) {
    return 'BQ';
  }
  if (['C0', 'C1', 'C2', 'C3', 'C4', 'C5'].includes(c)) return 'CAI';
  if (['OD', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'OC', 'TV', 'PA', '49', 'EX', 'RE', 'IM'].includes(c)) return 'OD';
  if (['AN', '20', '10'].includes(c)) return 'AN';

  if (l.includes('CAISSE')) return 'CAI';
  if (l.includes('BANQUE') || l.includes('CREDIT')) return 'BQ';
  if (l.includes('ACHAT')) return 'ACH';
  if (l.includes('VENTE')) return 'VEN';
  if (l.includes('A NOUVEAU') || l.includes('A-NOUVEAU') || l.includes('ANOUVEAU')) return 'AN';
  if (l.includes('OPERATIONS DIVERSES') || /\bOD\b/.test(l)) return 'OD';
  return 'OTHER';
}

/** @type {(code: unknown, lib?: unknown) => string} */
let classifyJournalImported = classifyJournalLocal;
if (existsSync(JOURNALS_PATH)) {
  const mod = await import('./lab-detection-journals.js');
  if (typeof mod.classifyJournal === 'function') {
    classifyJournalImported = mod.classifyJournal;
  }
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Montant ligne = |Debit| ou |Credit| (FEC : un seul côté renseigné en principe).
 * @param {object} row
 * @returns {number}
 */
function lineMontant(row) {
  const d = Math.abs(toNum(row.Debit));
  const c = Math.abs(toNum(row.Credit));
  return Math.max(d, c);
}

/**
 * @param {object} row
 * @returns {{ Idlig: *, EcritureNum: string, EcritureDate: *, JournalCode: string, CompteNum: string, montant: number, EcritureLib: string }}
 */
function toAlertLine(row) {
  return {
    Idlig: row.Idlig ?? null,
    EcritureNum: str(row.EcritureNum),
    EcritureDate: row.EcritureDate ?? null,
    JournalCode: str(row.JournalCode),
    CompteNum: str(row.CompteNum),
    montant: lineMontant(row),
    EcritureLib: str(row.EcritureLib),
  };
}

/**
 * @param {string} compte
 * @param {string} prefix
 */
function compteStarts(compte, prefix) {
  return str(compte).startsWith(prefix);
}

/**
 * @param {string} compte
 */
function is401(compte) {
  return compteStarts(compte, '401');
}

function is411(compte) {
  return compteStarts(compte, '411');
}

function is445(compte) {
  return compteStarts(compte, '445');
}

/** TVA collectée (PCG 4457*). */
function isTvaCollectee(compte) {
  return compteStarts(compte, '4457');
}

/** TVA déductible (PCG 4456*). */
function isTvaDeductible(compte) {
  return compteStarts(compte, '4456');
}

function isCharge(compte) {
  return /^6/.test(str(compte));
}

function isProduit(compte) {
  return /^7/.test(str(compte));
}

/** Trésorerie : 512* banque + 53* caisse. */
function isTreso(compte) {
  const c = str(compte);
  return c.startsWith('512') || c.startsWith('53');
}

/**
 * Parse date FEC (Date, YYYYMMDD, ISO…).
 * @param {unknown} v
 * @returns {Date|null}
 */
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * @param {string} code
 * @param {string} motif
 * @param {object[]} rows
 * @returns {{ code: string, famille: string, gravite: number, motif: string, lines: object[] }|null}
 */
function makeAlert(code, motif, rows) {
  if (!rows.length) return null;
  return {
    code,
    famille: FAMILLE,
    gravite: GRAVITE,
    motif,
    lines: rows.map(toAlertLine),
  };
}

/**
 * @param {Array<object|null>} alerts
 */
function capAlerts(alerts) {
  return alerts.filter(Boolean);
}

/**
 * Groupe les lignes par EcritureNum.
 * @param {object[]} rows
 * @returns {Map<string, object[]>}
 */
function groupByEcritureNum(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = str(row.EcritureNum) || `__noid_${row.Idlig ?? Math.random()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlFour(rows, _classify, seuilEur) {
  const groups = groupByEcritureNum(rows);
  const alerts = [];
  for (const [num, lines] of groups) {
    const four = lines.filter((r) => is401(r.CompteNum));
    if (!four.length) continue;
    if (lines.some((r) => is445(r.CompteNum))) continue;
    const hit = four.filter((r) => lineMontant(r) >= seuilEur);
    if (!hit.length) continue;
    alerts.push(makeAlert(
      'CTRLFOUR',
      `Fournisseur sans TVA (EcritureNum ${num} : 401 sans 445)`,
      hit,
    ));
  }
  return capAlerts(alerts);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlCli(rows, _classify, seuilEur) {
  const groups = groupByEcritureNum(rows);
  const alerts = [];
  for (const [num, lines] of groups) {
    const cli = lines.filter((r) => is411(r.CompteNum));
    if (!cli.length) continue;
    if (lines.some((r) => is445(r.CompteNum))) continue;
    const hit = cli.filter((r) => lineMontant(r) >= seuilEur);
    if (!hit.length) continue;
    alerts.push(makeAlert(
      'CTRLCLI',
      `Client sans TVA (EcritureNum ${num} : 411 sans 445)`,
      hit,
    ));
  }
  return capAlerts(alerts);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlOdVe(rows, classify, seuilEur) {
  const hit = rows.filter(
    (r) => classify(r) === 'OD' && isProduit(r.CompteNum) && lineMontant(r) >= seuilEur,
  );
  return capAlerts(hit.length
    ? [makeAlert('CTRLODVE', 'Ventes (7*) dans un journal OD', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlOdAc(rows, classify, seuilEur) {
  const hit = rows.filter(
    (r) => classify(r) === 'OD' && isCharge(r.CompteNum) && lineMontant(r) >= seuilEur,
  );
  return capAlerts(hit.length
    ? [makeAlert('CTRLODAC', 'Achats / charges (6*) dans un journal OD', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlAc(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    const fam = classify(r);
    if (fam === 'ACH' || fam === 'AN') return false;
    return isCharge(r.CompteNum) && lineMontant(r) >= seuilEur;
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLAC', 'Charges (6*) hors journal ACH', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlVe(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    const fam = classify(r);
    if (fam === 'VEN' || fam === 'AN') return false;
    return isProduit(r.CompteNum) && lineMontant(r) >= seuilEur;
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLVE', 'Ventes / produits (7*) hors journal VEN', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrl411(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    if (!is411(r.CompteNum) || lineMontant(r) < seuilEur) return false;
    const fam = classify(r);
    return fam !== 'VEN' && fam !== 'BQ' && fam !== 'AN';
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRL411', 'Compte 411 hors journaux VEN / BQ / AN', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlTreso(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    if (!isTreso(r.CompteNum) || lineMontant(r) < seuilEur) return false;
    const fam = classify(r);
    return fam !== 'BQ' && fam !== 'CAI';
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLTRESO', 'Trésorerie (512/53) hors journaux BQ / CAI', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlTvaHjVe(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    if (!isTvaCollectee(r.CompteNum) || lineMontant(r) < seuilEur) return false;
    return classify(r) !== 'VEN';
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLTVAHJVE', 'TVA collectée (4457*) hors journal VEN', hit)]
    : []);
}

/**
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlTvaDhAc(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    if (!isTvaDeductible(r.CompteNum) || lineMontant(r) < seuilEur) return false;
    return classify(r) !== 'ACH';
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLTVADHAC', 'TVA déductible (4456*) hors journal ACH', hit)]
    : []);
}

/**
 * Ligne à montant nul (Debit + Credit = 0).
 * @param {object[]} rows
 */
function ctrlE0(rows) {
  const hit = rows.filter((r) => {
    const sum = toNum(r.Debit) + toNum(r.Credit);
    return Math.abs(sum) < 0.005 && lineMontant(r) < 0.005;
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLE0', 'Écriture à montant 0 (débit + crédit = 0)', hit)]
    : []);
}

/**
 * Empreinte ligne FEC (hors Idlig) pour détecter de vrais doublons d'import,
 * pas de simples montants identiques sur le même compte dans une écriture.
 * @param {object} row
 * @returns {string}
 */
function doubfecFingerprint(row) {
  const debit = toNum(row.Debit).toFixed(2);
  const credit = toNum(row.Credit).toFixed(2);
  return [
    str(row.JournalCode),
    str(row.EcritureNum),
    str(row.EcritureDate),
    str(row.CompteNum),
    str(row.CompAuxNum),
    str(row.PieceRef),
    str(row.EcritureLib),
    debit,
    credit,
  ].join('|');
}

/**
 * Doublons : lignes strictement identiques (hors Idlig) — même journal, pièce, compte,
 * auxiliaire, libellé, débit et crédit. Ignore AN (reports souvent répétés) et montants nuls.
 * @param {object[]} rows
 * @param {(row: object) => string} [classify]
 */
function ctrlDoubfec(rows, classify) {
  const buckets = new Map();
  for (const row of rows) {
    if (lineMontant(row) < 0.005) continue;
    if (typeof classify === 'function' && classify(row) === 'AN') continue;
    if (str(row.JournalCode).toUpperCase() === 'AN') continue;
    const key = doubfecFingerprint(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const alerts = [];
  for (const [key, lines] of buckets) {
    if (lines.length < 2) continue;
    alerts.push(makeAlert(
      'DOUBFEC',
      `Doublon FEC (${lines.length}× ligne identique) : ${key}`,
      lines,
    ));
  }
  return capAlerts(alerts);
}

/**
 * Validate vide.
 * @param {object[]} rows
 * @param {number} seuilEur
 */
function ctrlVdVide(rows, seuilEur) {
  const hit = rows.filter((r) => {
    const v = r.Validate;
    const empty = v == null || str(v) === '';
    return empty && lineMontant(r) >= seuilEur;
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLVDVIDE', 'Validate IS NULL (écriture non validée)', hit)]
    : []);
}

/**
 * EcritureDate > Validate.
 * @param {object[]} rows
 * @param {number} seuilEur
 */
function ctrlDate(rows, seuilEur) {
  const hit = rows.filter((r) => {
    const val = parseDate(r.Validate);
    if (!val) return false;
    const ec = parseDate(r.EcritureDate);
    if (!ec) return false;
    if (ec.getTime() <= val.getTime()) return false;
    return lineMontant(r) >= seuilEur;
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLDATE', 'EcritureDate postérieure à Validate', hit)]
    : []);
}

/**
 * PieceRef vide hors AN.
 * @param {object[]} rows
 * @param {(row: object) => string} classify
 * @param {number} seuilEur
 */
function ctrlPieRef(rows, classify, seuilEur) {
  const hit = rows.filter((r) => {
    if (classify(r) === 'AN') return false;
    const pref = r.PieceRef;
    const empty = pref == null || str(pref) === '';
    return empty && lineMontant(r) >= seuilEur;
  });
  return capAlerts(hit.length
    ? [makeAlert('CTRLPIEREF', 'PieceRef vide sur journal non AN', hit)]
    : []);
}

/**
 * Lance tous les contrôles COH sur un jeu de lignes FEC (déjà filtré code_client + datefinex N).
 *
 * @param {object[]} rows
 * @param {{ seuilEur?: number, classifyJournal?: (code: unknown, lib?: unknown) => string }} [options]
 * @returns {object[]} alertes plates (toutes familles COH)
 */
export function runCohControls(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const seuilEur = Number.isFinite(Number(options.seuilEur)) && Number(options.seuilEur) >= 0
    ? Number(options.seuilEur)
    : SEUIL_EUR_DEFAULT;

  const classifyFn = typeof options.classifyJournal === 'function'
    ? options.classifyJournal
    : classifyJournalImported;

  /** @param {object} row */
  const classify = (row) => classifyFn(row.JournalCode, row.JournalLib);

  const alerts = [
    ...ctrlFour(list, classify, seuilEur),
    ...ctrlCli(list, classify, seuilEur),
    ...ctrlOdVe(list, classify, seuilEur),
    ...ctrlOdAc(list, classify, seuilEur),
    // CTRLOD67 retiré : doublon exact de CTRLODVE + CTRLODAC
    ...ctrlAc(list, classify, seuilEur),
    ...ctrlVe(list, classify, seuilEur),
    ...ctrl411(list, classify, seuilEur),
    ...ctrlTreso(list, classify, seuilEur),
    ...ctrlTvaHjVe(list, classify, seuilEur),
    ...ctrlTvaDhAc(list, classify, seuilEur),
    ...ctrlE0(list),
    ...ctrlDoubfec(list, classify),
    ...ctrlVdVide(list, seuilEur),
    ...ctrlDate(list, seuilEur),
    ...ctrlPieRef(list, classify, seuilEur),
  ];

  return alerts;
}

/** Codes implémentés (référence). */
export const COH_CONTROL_CODES = Object.freeze([
  'CTRLFOUR',
  'CTRLCLI',
  'CTRLODVE',
  'CTRLODAC',
  'CTRLAC',
  'CTRLVE',
  'CTRL411',
  'CTRLTRESO',
  'CTRLTVAHJVE',
  'CTRLTVADHAC',
  'CTRLE0',
  'DOUBFEC',
  'CTRLVDVIDE',
  'CTRLDATE',
  'CTRLPIEREF',
]);
