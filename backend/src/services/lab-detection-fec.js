/**
 * Chargement FEC (exercice N) pour la détection d'opérations atypiques.
 *
 * Source : dbo.vue_fec WITH (NOLOCK).
 * Risque timeout : requestTimeout DB ~60s (DB_REQUEST_TIMEOUT_MS). Sur gros dossiers
 * préférer loadFecLinesBatched / streamFecLines plutôt que loadFecLines en un seul SELECT.
 */

import { poolPromise, sql } from '../config/db.js';

/** Colonnes utiles détection (évite SELECT *). */
export const FEC_SELECT_COLUMNS = Object.freeze([
  'code_client',
  'datefinex',
  'Idlig',
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'Validate',
  'ModeRglt',
  'NatOp',
]);

const FEC_SELECT_SQL = FEC_SELECT_COLUMNS.join(',\n      ');

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanCodeClient(value) {
  return String(value ?? '').trim();
}

/**
 * Date seule → Date UTC minuit (bind sql.Date sans décalage).
 * @param {unknown} value
 * @returns {Date|null}
 */
export function parseDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Montant absolu de la ligne (Debit ou Credit).
 * @param {{ Debit?: unknown, Credit?: unknown }} row
 * @returns {number}
 */
export function lineAmount(row) {
  const d = toAmount(row?.Debit);
  const c = toAmount(row?.Credit);
  if (d !== 0) return Math.abs(d);
  if (c !== 0) return Math.abs(c);
  return 0;
}

/**
 * Mouvement signé Debit − Credit.
 * @param {{ Debit?: unknown, Credit?: unknown }} row
 * @returns {number}
 */
export function signedMovement(row) {
  return toAmount(row?.Debit) - toAmount(row?.Credit);
}

/**
 * Enrichit une ligne FEC avec montant / mouvement normalisés.
 * @param {object} row
 * @returns {object}
 */
export function normalizeFecRow(row) {
  const montant = lineAmount(row);
  const mouvement = signedMovement(row);
  return {
    ...row,
    montant,
    mouvement,
    amount: montant,
    signed: mouvement,
  };
}

/**
 * Table FEC annuelle (whitelist) — vue_fec trop lente sur gros dossiers.
 * @param {Date|string} dateParam
 * @returns {string} nom table qualifié
 */
function resolveFecTable(dateParam) {
  const d = parseDateOnly(dateParam) ?? (dateParam instanceof Date ? dateParam : null);
  const year = d ? d.getUTCFullYear() : null;
  if (year === 2024) return 'dbo.FEC_2024';
  if (year === 2025) return 'dbo.FEC_2025';
  if (year === 2026) return 'dbo.fec_2026';
  // fallback vue (petits volumes / années hors mapping)
  return 'dbo.vue_fec';
}

/**
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} code
 * @param {Date|string} dateParam
 * @param {number} batchSize
 * @param {unknown} lastIdlig
 */
async function fetchFecBatch(pool, code, dateParam, batchSize, lastIdlig) {
  const table = resolveFecTable(dateParam);
  const request = pool
    .request()
    .input('code_client', sql.NVarChar(10), code)
    .input('datefinex', sql.Date, dateParam)
    .input('batch_size', sql.Int, batchSize);

  let idligClause = '';
  if (lastIdlig != null) {
    request.input('last_idlig', sql.BigInt, lastIdlig);
    idligClause = 'AND Idlig > @last_idlig';
  }

  // Pas de RTRIM/LTRIM sur code_client : empêche l'usage d'index et timeout (~60s).
  const result = await request.query(`
    SELECT TOP (@batch_size)
      ${FEC_SELECT_SQL}
    FROM ${table} WITH (NOLOCK)
    WHERE code_client = @code_client
      AND datefinex = @datefinex
      ${idligClause}
    ORDER BY Idlig
  `);

  return (result.recordset || []).map(normalizeFecRow);
}

/**
 * Exercice N = MAX(datefinex) pour le dossier.
 * @param {string} codeClient
 * @returns {Promise<Date|null>}
 */
export async function getMaxDateFinex(codeClient) {
  const code = cleanCodeClient(codeClient);
  if (!code) return null;

  const pool = await poolPromise;
  // Aggregats_FEC d'abord (rapide) ; fallback vue_fec sans RTRIM.
  const fromAgg = await pool
    .request()
    .input('code_client', sql.NVarChar(10), code)
    .query(`
      SELECT MAX(datefinex) AS datefinex
      FROM dbo.Aggregats_FEC WITH (NOLOCK)
      WHERE code_client = @code_client
    `);
  let raw = fromAgg.recordset?.[0]?.datefinex;
  if (raw == null) {
    const fromVue = await pool
      .request()
      .input('code_client', sql.NVarChar(10), code)
      .query(`
        SELECT MAX(datefinex) AS datefinex
        FROM dbo.vue_fec WITH (NOLOCK)
        WHERE code_client = @code_client
      `);
    raw = fromVue.recordset?.[0]?.datefinex;
  }
  if (raw == null) return null;
  return raw instanceof Date ? raw : parseDateOnly(raw);
}

/**
 * Charge toutes les lignes FEC d'un exercice.
 * Attention timeout (~60s) si volume très élevé — utiliser loadFecLinesBatched.
 *
 * @param {string} codeClient
 * @param {Date|string} datefinex
 * @returns {Promise<object[]>}
 */
export async function loadFecLines(codeClient, datefinex) {
  const code = cleanCodeClient(codeClient);
  const dateParam = parseDateOnly(datefinex) ?? datefinex;
  if (!code || dateParam == null) return [];

  const pool = await poolPromise;
  const table = resolveFecTable(dateParam);
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), code)
    .input('datefinex', sql.Date, dateParam)
    .query(`
      SELECT
        ${FEC_SELECT_SQL}
      FROM ${table} WITH (NOLOCK)
      WHERE code_client = @code_client
        AND datefinex = @datefinex
      ORDER BY EcritureDate, EcritureNum, Idlig
    `);

  return (result.recordset || []).map(normalizeFecRow);
}

/**
 * Chargement par lots (clé Idlig) pour limiter pression mémoire / timeout.
 *
 * @param {string} codeClient
 * @param {Date|string} datefinex
 * @param {{ batchSize?: number, onBatch?: (rows: object[]) => void|Promise<void> }} [options]
 * @returns {Promise<object[]>} lignes accumulées si pas de onBatch ; [] si onBatch fourni
 */
export async function loadFecLinesBatched(codeClient, datefinex, options = {}) {
  const code = cleanCodeClient(codeClient);
  const dateParam = parseDateOnly(datefinex) ?? datefinex;
  const batchSize = Math.max(500, Number(options.batchSize) || 5000);
  const onBatch = typeof options.onBatch === 'function' ? options.onBatch : null;

  if (!code || dateParam == null) return [];

  // Tables annuelles : 1 SELECT (Idlig keyset trop lent ~30s+/lot).
  // vue_fec : rester en lots pour limiter timeout.
  const table = resolveFecTable(dateParam);
  if (table !== 'dbo.vue_fec') {
    const rows = await loadFecLines(code, dateParam);
    if (onBatch) {
      for (let i = 0; i < rows.length; i += batchSize) {
        await onBatch(rows.slice(i, i + batchSize));
      }
      return [];
    }
    return rows;
  }

  const pool = await poolPromise;
  /** @type {object[]} */
  const all = [];
  let lastIdlig = null;
  let hasMore = true;

  while (hasMore) {
    const batch = await fetchFecBatch(pool, code, dateParam, batchSize, lastIdlig);
    if (batch.length === 0) break;

    if (onBatch) await onBatch(batch);
    else all.push(...batch);

    lastIdlig = batch[batch.length - 1].Idlig;
    hasMore = batch.length >= batchSize;
  }

  return onBatch ? [] : all;
}

/**
 * Itère les lots sans accumuler toute la FEC en mémoire.
 * @param {string} codeClient
 * @param {Date|string} datefinex
 * @param {{ batchSize?: number }} [options]
 * @returns {AsyncGenerator<object[], void, void>}
 */
export async function* streamFecLines(codeClient, datefinex, options = {}) {
  const code = cleanCodeClient(codeClient);
  const dateParam = parseDateOnly(datefinex) ?? datefinex;
  const batchSize = Math.max(500, Number(options.batchSize) || 5000);
  if (!code || dateParam == null) return;

  const pool = await poolPromise;
  let lastIdlig = null;
  let hasMore = true;

  while (hasMore) {
    const batch = await fetchFecBatch(pool, code, dateParam, batchSize, lastIdlig);
    if (batch.length === 0) break;
    yield batch;
    lastIdlig = batch[batch.length - 1].Idlig;
    hasMore = batch.length >= batchSize;
  }
}
