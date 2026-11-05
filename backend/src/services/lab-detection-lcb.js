/**
 * Contrôles LCB-FT (exercice N) — lot 1 : LCB-03/04/05/07/12.
 * Entrée : lignes FEC déjà filtrées code_client + datefinex N.
 * Pas de benchmarks sectoriels.
 */

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** @typedef {{ code: string, famille: 'LCB', gravite: 3, motif: string, lines: object[] }} LcbAlert */

const GRAVITE_LCB = 3;
const TOLERANCE = 0.01;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const journalsPath = path.join(__dirname, 'lab-detection-journals.js');

/**
 * Fallback minimal si lab-detection-journals.js absent.
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
  if (/^B[0-9QPN]$/.test(c) || ['BQ', 'BP', 'BN', 'BB', 'BE', 'BA', 'CM', 'BC', 'BF', 'CB', 'CC', 'BH'].includes(c)) return 'BQ';
  if (['C0', 'C1', 'C2', 'C3', 'C4', 'C5'].includes(c) || l.includes('CAISSE')) return 'CAI';
  if (['OD', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'OC', 'TV', 'PA', '49', 'EX', 'RE', 'IM'].includes(c)) return 'OD';
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

/** @param {object} row @returns {number} */
function signedMovement(row) {
  return toAmount(row?.Debit) - toAmount(row?.Credit);
}

/** @param {object} row @returns {number} */
function lineAmount(row) {
  const d = toAmount(row?.Debit);
  const c = toAmount(row?.Credit);
  if (d !== 0) return Math.abs(d);
  if (c !== 0) return Math.abs(c);
  return 0;
}

/**
 * @param {unknown} value
 * @returns {Date|null} date UTC minuit
 */
function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const s = String(value ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  if (/^\d{8}$/.test(s)) {
    return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  }
  return null;
}

/** @param {Date} d @returns {string} */
function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {object} row @returns {object} */
function toAlertLine(row) {
  const montant = row.montant != null ? Number(row.montant) : lineAmount(row);
  return {
    Idlig: row.Idlig ?? null,
    EcritureNum: row.EcritureNum ?? null,
    EcritureDate: row.EcritureDate ?? null,
    JournalCode: row.JournalCode ?? null,
    CompteNum: row.CompteNum ?? null,
    montant,
    EcritureLib: row.EcritureLib ?? null,
  };
}

/** @param {unknown} compte @returns {string} */
function compteNum(compte) {
  return String(compte ?? '').trim();
}

/**
 * Date de contrôle : opts.controlDate || max(EcritureDate) || today.
 * @param {object[]} rows
 * @param {object} [opts]
 * @returns {Date}
 */
function resolveControlDate(rows, opts = {}) {
  if (opts.controlDate) {
    const d = parseDate(opts.controlDate);
    if (d) return d;
  }
  let max = null;
  for (const row of rows) {
    const d = parseDate(row.EcritureDate);
    if (d && (!max || d > max)) max = d;
  }
  if (max) return max;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Fins de mois entre min et max (inclus), + max si pas fin de mois.
 * @param {Date} start
 * @param {Date} end
 * @returns {Date[]}
 */
function monthEnds(start, end) {
  const res = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (true) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    if (lastDay > end) break;
    if (lastDay >= start) res.push(lastDay);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  if (!res.length || res[res.length - 1].getTime() !== end.getTime()) {
    res.push(end);
  }
  return res;
}

/**
 * LCB-03 — Paiements espèces > 1 000 € (caisse → 401 / 6xx).
 * @param {object[]} rows
 * @param {{ especeSeuil?: number }} [opts]
 * @returns {LcbAlert[]}
 */
function controlLcb03(rows, opts = {}) {
  const seuil = Number(opts.especeSeuil) > 0 ? Number(opts.especeSeuil) : 1000;
  /** @type {Map<string, object[]>} */
  const byEcriture = new Map();
  for (const row of rows) {
    const num = String(row.EcritureNum ?? '').trim();
    if (!num) continue;
    if (!byEcriture.has(num)) byEcriture.set(num, []);
    byEcriture.get(num).push(row);
  }

  /** @type {object[]} */
  const hitLines = [];
  const seen = new Set();

  for (const [, lines] of byEcriture) {
    const caisseOut = lines.filter((r) => {
      const cn = compteNum(r.CompteNum);
      return cn.startsWith('53') && toAmount(r.Credit) > TOLERANCE;
    });
    if (!caisseOut.length) continue;

    const payees = lines.filter((r) => {
      const cn = compteNum(r.CompteNum);
      return (cn.startsWith('401') || /^6/.test(cn)) && toAmount(r.Debit) > TOLERANCE;
    });
    if (!payees.length) continue;

    for (const cash of caisseOut) {
      const amt = toAmount(cash.Credit);
      if (amt <= seuil + TOLERANCE) continue;
      // Même écriture : paiement fournisseur / charge en espèces
      const key = `${cash.Idlig ?? ''}|${cash.EcritureNum}|${ymd(parseDate(cash.EcritureDate) || new Date(0))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hitLines.push(toAlertLine({ ...cash, montant: amt }));
      for (const p of payees.slice(0, 3)) {
        hitLines.push(toAlertLine(p));
      }
    }
  }

  // Variante journal CAI : débit 401/6xx > seuil sans 53 explicite dans l'écriture
  for (const row of rows) {
    const fam = classifyJournal(row.JournalCode, row.JournalLib);
    if (fam !== 'CAI') continue;
    const cn = compteNum(row.CompteNum);
    if (!(cn.startsWith('401') || /^6/.test(cn))) continue;
    const amt = toAmount(row.Debit);
    if (amt <= seuil + TOLERANCE) continue;
    const key = `cai|${row.Idlig ?? ''}|${row.EcritureNum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hitLines.push(toAlertLine({ ...row, montant: amt }));
  }

  if (!hitLines.length) return [];
  return [{
    code: 'LCB-03',
    famille: 'LCB',
    gravite: GRAVITE_LCB,
    motif: `Paiements en espèces > ${seuil} € (caisse / 401 / 6xx)`,
    lines: hitLines,
  }];
}

/**
 * LCB-04 — Caisse jamais créditrice + recettes rondes répétées (CTRLCAISSE).
 * @param {object[]} rows
 * @param {{ roundRepeatMin?: number, roundWindowDays?: number }} [opts]
 * @returns {LcbAlert[]}
 */
function controlLcb04(rows, opts = {}) {
  const roundRepeatMin = Number(opts.roundRepeatMin) > 0 ? Number(opts.roundRepeatMin) : 3;
  const windowDays = Number(opts.roundWindowDays) > 0 ? Number(opts.roundWindowDays) : 10;
  /** @type {LcbAlert[]} */
  const alerts = [];

  /** @type {Map<string, { row: object, date: Date, signed: number, amount: number }[]>} */
  const byCompte = new Map();
  for (const row of rows) {
    const cn = compteNum(row.CompteNum);
    if (!cn.startsWith('53')) continue;
    const d = parseDate(row.EcritureDate);
    if (!d) continue;
    if (!byCompte.has(cn)) byCompte.set(cn, []);
    byCompte.get(cn).push({
      row,
      date: d,
      signed: signedMovement(row),
      amount: lineAmount(row),
    });
  }

  /** @type {object[]} */
  const negLines = [];
  for (const [cn, ev] of byCompte) {
    ev.sort((a, b) => {
      const t = a.date - b.date;
      if (t !== 0) return t;
      return String(a.row.EcritureNum ?? '').localeCompare(String(b.row.EcritureNum ?? ''));
    });
    let bal = 0;
    let worst = null;
    for (const e of ev) {
      bal += e.signed;
      if (bal < -TOLERANCE && (!worst || bal < worst.bal)) {
        worst = { bal, e };
      }
    }
    if (worst) {
      negLines.push(toAlertLine({
        ...worst.e.row,
        montant: worst.bal,
        EcritureLib: `Solde min ${worst.bal.toFixed(2)} € (${cn}) — ${worst.e.row.EcritureLib ?? ''}`,
      }));
    }
  }

  if (negLines.length) {
    alerts.push({
      code: 'LCB-04',
      famille: 'LCB',
      gravite: GRAVITE_LCB,
      motif: 'Caisse (53*) : solde cumulé créditeur (négatif) détecté',
      lines: negLines,
    });
  }

  // Recettes = débits 53* (entrées de caisse), montants ronds (centaines) / répétitions sur 10 j
  /** @type {object[]} */
  const roundHits = [];
  for (const [, ev] of byCompte) {
    const recettes = ev.filter((e) => toAmount(e.row.Debit) > TOLERANCE);
    // Group by rounded amount (centaines exactes)
    /** @type {Map<number, typeof recettes>} */
    const byAmt = new Map();
    for (const e of recettes) {
      const amt = toAmount(e.row.Debit);
      const isHundred = Math.abs(amt % 100) < TOLERANCE && amt >= 100;
      if (!isHundred) continue;
      const key = Math.round(amt);
      if (!byAmt.has(key)) byAmt.set(key, []);
      byAmt.get(key).push(e);
    }
    for (const [amt, list] of byAmt) {
      list.sort((a, b) => a.date - b.date);
      // Fenêtre glissante 10 jours
      let j = 0;
      for (let i = 0; i < list.length; i++) {
        while (j < list.length && (list[j].date - list[i].date) / 86400000 <= windowDays) j += 1;
        const count = j - i;
        if (count >= roundRepeatMin) {
          for (const e of list.slice(i, j)) {
            roundHits.push(toAlertLine({
              ...e.row,
              montant: amt,
              EcritureLib: `Recette ronde ${amt} € ×${count} / ${windowDays}j — ${e.row.EcritureLib ?? ''}`,
            }));
          }
          break;
        }
      }
    }
    // Même montant (pas forcément centaine) répété >= roundRepeatMin dans 10 j
    /** @type {Map<string, typeof recettes>} */
    const byExact = new Map();
    for (const e of recettes) {
      const amt = Math.round(toAmount(e.row.Debit) * 100) / 100;
      if (amt < 100) continue;
      const key = amt.toFixed(2);
      if (!byExact.has(key)) byExact.set(key, []);
      byExact.get(key).push(e);
    }
    for (const [amtStr, list] of byExact) {
      if (list.length < roundRepeatMin) continue;
      list.sort((a, b) => a.date - b.date);
      let j = 0;
      for (let i = 0; i < list.length; i++) {
        while (j < list.length && (list[j].date - list[i].date) / 86400000 <= windowDays) j += 1;
        if (j - i >= roundRepeatMin) {
          for (const e of list.slice(i, j)) {
            roundHits.push(toAlertLine({
              ...e.row,
              montant: Number(amtStr),
              EcritureLib: `Montant répété ${amtStr} € ×${j - i} / ${windowDays}j — ${e.row.EcritureLib ?? ''}`,
            }));
          }
          break;
        }
      }
    }
  }

  if (roundHits.length) {
    // Dédup Idlig
    const uniq = [];
    const seen = new Set();
    for (const line of roundHits) {
      const k = String(line.Idlig ?? `${line.EcritureNum}|${line.CompteNum}|${line.montant}`);
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(line);
    }
    alerts.push({
      code: 'LCB-04',
      famille: 'LCB',
      gravite: GRAVITE_LCB,
      motif: `Recettes de caisse rondes / répétées (≥ ${roundRepeatMin}× sur ${windowDays} j)`,
      lines: uniq,
    });
  }

  return alerts;
}

/**
 * LCB-05 — Fonds en transit 58* / 511* non soldés fin de mois (CDC n°2).
 * Tolérance : zéro atteint entre le 25 et la fin du mois.
 * @param {object[]} rows
 * @param {object} [opts]
 * @returns {LcbAlert[]}
 */
function controlLcb05(rows, opts = {}) {
  const controlDate = resolveControlDate(rows, opts);
  const dates = [];
  for (const row of rows) {
    const d = parseDate(row.EcritureDate);
    if (d) dates.push(d);
  }
  if (!dates.length) return [];
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const ends = monthEnds(start, controlDate);

  /** @type {Map<string, { date: Date, signed: number, row: object }[]>} */
  const byCompte = new Map();
  for (const row of rows) {
    const cn = compteNum(row.CompteNum);
    if (!(cn.startsWith('58') || cn.startsWith('511'))) continue;
    const d = parseDate(row.EcritureDate);
    if (!d) continue;
    if (!byCompte.has(cn)) byCompte.set(cn, []);
    byCompte.get(cn).push({ date: d, signed: signedMovement(row), row });
  }

  /** @type {object[]} */
  const hitLines = [];
  for (const [cn, ev] of byCompte) {
    ev.sort((a, b) => a.date - b.date);
    for (const end of ends) {
      const windowStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 25));
      let baseline = 0;
      for (const e of ev) {
        if (e.date < windowStart) baseline += e.signed;
      }
      let running = baseline;
      let zeroInWindow = Math.abs(baseline) <= TOLERANCE;
      for (const e of ev) {
        if (e.date >= windowStart && e.date <= end) {
          running += e.signed;
          if (Math.abs(running) <= TOLERANCE) zeroInWindow = true;
        }
      }
      if (zeroInWindow) continue;
      let finalBal = 0;
      let sample = null;
      for (const e of ev) {
        if (e.date <= end) {
          finalBal += e.signed;
          sample = e.row;
        }
      }
      if (Math.abs(finalBal) <= TOLERANCE) continue;
      hitLines.push(toAlertLine({
        ...(sample || { CompteNum: cn, EcritureDate: ymd(end) }),
        CompteNum: cn,
        EcritureDate: ymd(end),
        montant: finalBal,
        EcritureLib: `Compte ${cn} solde ${finalBal.toFixed(2)} € au ${ymd(end)} (non nul 25→fin)`,
      }));
    }
  }

  if (!hitLines.length) return [];
  return [{
    code: 'LCB-05',
    famille: 'LCB',
    gravite: GRAVITE_LCB,
    motif: 'Fonds en transit (58* / 511*) non soldés en fin de mois',
    lines: hitLines,
  }];
}

/**
 * LCB-07 — CCA 455* / 108* : solde débiteur > seuil ; mouvements importants.
 * @param {object[]} rows
 * @param {{ seuilEur?: number, largeMoveEur?: number }} [opts]
 * @returns {LcbAlert[]}
 */
function controlLcb07(rows, opts = {}) {
  const seuilEur = Number(opts.seuilEur) > 0 ? Number(opts.seuilEur) : 6000;
  const largeMoveEur = Number(opts.largeMoveEur) > 0 ? Number(opts.largeMoveEur) : seuilEur;

  /** @type {Map<string, { row: object, date: Date, signed: number }[]>} */
  const byCompte = new Map();
  /** @type {object[]} */
  const largeMoves = [];

  for (const row of rows) {
    const cn = compteNum(row.CompteNum);
    if (!(cn.startsWith('455') || cn.startsWith('108'))) continue;
    const d = parseDate(row.EcritureDate);
    const signed = signedMovement(row);
    const amt = lineAmount(row);
    // À-nouveaux = reports d'ouverture, pas des mouvements de l'exercice
    const fam = classifyJournal(row.JournalCode, row.JournalLib);
    if (fam !== 'AN' && amt >= largeMoveEur - TOLERANCE) {
      largeMoves.push(toAlertLine({
        ...row,
        montant: amt,
        EcritureLib: `Mouvement important ${amt.toFixed(2)} € — ${row.EcritureLib ?? ''}`,
      }));
    }
    if (!d) continue;
    if (!byCompte.has(cn)) byCompte.set(cn, []);
    byCompte.get(cn).push({ row, date: d, signed });
  }

  /** @type {object[]} */
  const debitHits = [];
  for (const [cn, ev] of byCompte) {
    ev.sort((a, b) => a.date - b.date || String(a.row.EcritureNum ?? '').localeCompare(String(b.row.EcritureNum ?? '')));
    let bal = 0;
    let worst = null;
    for (const e of ev) {
      bal += e.signed;
      if (bal > seuilEur + TOLERANCE && (!worst || bal > worst.bal)) {
        worst = { bal, e };
      }
    }
    if (worst) {
      debitHits.push(toAlertLine({
        ...worst.e.row,
        montant: worst.bal,
        EcritureLib: `Solde débiteur max ${worst.bal.toFixed(2)} € (${cn}, seuil ${seuilEur}) — ${worst.e.row.EcritureLib ?? ''}`,
      }));
    }
  }

  /** @type {LcbAlert[]} */
  const alerts = [];
  if (debitHits.length) {
    alerts.push({
      code: 'LCB-07',
      famille: 'LCB',
      gravite: GRAVITE_LCB,
      motif: `Compte courant (455*/108*) : solde débiteur > ${seuilEur} €`,
      lines: debitHits,
    });
  }
  if (largeMoves.length) {
    alerts.push({
      code: 'LCB-07',
      famille: 'LCB',
      gravite: GRAVITE_LCB,
      motif: `Compte courant (455*/108*) : mouvements ≥ ${largeMoveEur} €`,
      lines: largeMoves,
    });
  }
  return alerts;
}

/**
 * Ligne lettrée si EcritureLet ou DateLet est renseigné (régularisation).
 * @param {object} row
 * @returns {boolean}
 */
function isLettered(row) {
  const ecritureLet = String(row.EcritureLet ?? '').trim();
  if (ecritureLet) return true;
  const dateLet = row.DateLet;
  if (dateLet == null || dateLet === '') return false;
  if (dateLet instanceof Date) return !Number.isNaN(dateLet.getTime());
  return String(dateLet).trim() !== '';
}

/**
 * LCB-12 — Comptes d'attente 47* non lettrés > 60 jours (aligné C5 / Caseware).
 * Requiert DateLet + EcritureLet dans le chargement FEC.
 * @param {object[]} rows
 * @param {{ controlDate?: unknown, ageDays?: number }} [opts]
 * @returns {LcbAlert[]}
 */
function controlLcb12(rows, opts = {}) {
  const ageDays = Number(opts.ageDays) > 0 ? Number(opts.ageDays) : 60;
  const controlDate = resolveControlDate(rows, opts);
  const cutoff = new Date(controlDate.getTime() - ageDays * 86400000);

  /** @type {object[]} */
  const hitLines = [];
  for (const row of rows) {
    const cn = compteNum(row.CompteNum);
    if (!cn.startsWith('47')) continue;
    const d = parseDate(row.EcritureDate);
    if (!d || d >= cutoff) continue;
    if (isLettered(row)) continue;
    hitLines.push(toAlertLine({
      ...row,
      EcritureLib: `47* non lettré (> ${ageDays} j au ${ymd(controlDate)}) — ${row.EcritureLib ?? ''}`,
    }));
  }

  if (!hitLines.length) return [];
  return [{
    code: 'LCB-12',
    famille: 'LCB',
    gravite: GRAVITE_LCB,
    motif: `Comptes d'attente 47* non lettrés (> ${ageDays} jours)`,
    lines: hitLines,
  }];
}

/**
 * Exécute les contrôles LCB lot 1 sur les lignes FEC N.
 * @param {object[]} rows
 * @param {{
 *   controlDate?: unknown,
 *   seuilEur?: number,
 *   largeMoveEur?: number,
 *   especeSeuil?: number,
 *   roundRepeatMin?: number,
 *   roundWindowDays?: number,
 *   ageDays?: number,
 *   codes?: string[],
 * }} [opts]
 * @returns {LcbAlert[]}
 */
export function runLcbControls(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = opts.codes
    ? new Set(opts.codes.map((c) => String(c).toUpperCase()))
    : null;

  /** @type {LcbAlert[]} */
  const alerts = [];
  const run = (code, fn) => {
    if (wanted && !wanted.has(code)) return;
    alerts.push(...fn());
  };

  run('LCB-03', () => controlLcb03(list, opts));
  run('LCB-04', () => controlLcb04(list, opts));
  run('LCB-05', () => controlLcb05(list, opts));
  run('LCB-07', () => controlLcb07(list, opts));
  run('LCB-12', () => controlLcb12(list, opts));

  return alerts;
}

export const LCB_CODES = Object.freeze(['LCB-03', 'LCB-04', 'LCB-05', 'LCB-07', 'LCB-12']);
