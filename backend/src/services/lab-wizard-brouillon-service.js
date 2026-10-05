/**
 * Brouillons de l'assistant dossier LAB (revue / acceptation).
 * Stockage JSON isolé du dossier officiel — UPSERT par (code_client, cle_brouillon).
 */

import { poolPromise, sql } from '../config/db.js';
import { LabDossierError, cleanText, parseEntityId } from './lab-utils.js';

const MAX_PAYLOAD_CHARS = 2_000_000;

function isMissingTableError(err) {
  return err?.number === 208;
}

/**
 * @param {string|number|null|undefined} idRevue
 * @param {string|null|undefined} mode
 * @returns {string}
 */
export function buildCleBrouillon(idRevue, mode) {
  if (idRevue != null && String(idRevue).trim() !== '') {
    const id = parseEntityId(idRevue, 'id_revue');
    return `revue:${id}`;
  }
  const modeClean = (cleanText(mode) || 'acceptation').toLowerCase();
  if (modeClean === 'acceptation') return 'acceptation';
  throw new LabDossierError('id_revue ou mode=acceptation requis pour le brouillon', 400);
}

function normalizeCodeClient(codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  return code;
}

function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code_client: cleanText(row.code_client),
    id_revue: row.id_revue ?? null,
    cle_brouillon: cleanText(row.cle_brouillon),
    payload: parsePayload(row.payload),
    date_creation: row.date_creation ?? null,
    date_modification: row.date_modification ?? null,
  };
}

/**
 * @param {string} codeClient
 * @param {{ id_revue?: string|number|null, mode?: string|null }} opts
 */
export async function getWizardBrouillonLab(codeClient, opts = {}) {
  const codeSafe = normalizeCodeClient(codeClient);
  const cle = buildCleBrouillon(opts.id_revue, opts.mode);
  const idRevue =
    opts.id_revue != null && String(opts.id_revue).trim() !== ''
      ? parseEntityId(opts.id_revue, 'id_revue')
      : null;

  const pool = await poolPromise;
  try {
    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('cle_brouillon', sql.NVarChar(40), cle)
      .query(`
        SELECT TOP 1
          id,
          RTRIM(LTRIM(code_client)) AS code_client,
          id_revue,
          RTRIM(LTRIM(cle_brouillon)) AS cle_brouillon,
          payload,
          date_creation,
          date_modification
        FROM lab_wizard_brouillons
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(cle_brouillon)) = RTRIM(LTRIM(@cle_brouillon))
      `);

    const row = result.recordset?.[0];
    if (!row) {
      return {
        brouillon: null,
        code_client: codeSafe,
        id_revue: idRevue,
        cle_brouillon: cle,
      };
    }
    return {
      brouillon: mapRow(row),
      code_client: codeSafe,
      id_revue: idRevue,
      cle_brouillon: cle,
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new LabDossierError(
        'Module brouillon wizard non disponible en base (table lab_wizard_brouillons)',
        503,
      );
    }
    throw err;
  }
}

/**
 * @param {string} codeClient
 * @param {object} payload
 * @param {{ id_revue?: string|number|null, mode?: string|null }} opts
 * @param {string|null} userId
 */
export async function upsertWizardBrouillonLab(codeClient, payload, opts = {}, userId = null) {
  const codeSafe = normalizeCodeClient(codeClient);
  const cle = buildCleBrouillon(opts.id_revue, opts.mode);
  const idRevue =
    opts.id_revue != null && String(opts.id_revue).trim() !== ''
      ? parseEntityId(opts.id_revue, 'id_revue')
      : null;

  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new LabDossierError('payload JSON objet requis', 400);
  }

  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > MAX_PAYLOAD_CHARS) {
    throw new LabDossierError('Brouillon trop volumineux', 413);
  }

  const user = cleanText(userId);
  const pool = await poolPromise;

  try {
    const existing = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('cle_brouillon', sql.NVarChar(40), cle)
      .query(`
        SELECT TOP 1 id
        FROM lab_wizard_brouillons
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(cle_brouillon)) = RTRIM(LTRIM(@cle_brouillon))
      `);

    const existingId = existing.recordset?.[0]?.id;

    if (existingId != null) {
      await pool
        .request()
        .input('id', sql.Int, existingId)
        .input('payload', sql.NVarChar(sql.MAX), payloadJson)
        .input('id_revue', sql.Int, idRevue)
        .input('modifie_par', sql.NChar(20), user)
        .query(`
          UPDATE lab_wizard_brouillons
          SET
            payload = @payload,
            id_revue = @id_revue,
            modifie_par = @modifie_par,
            date_modification = SYSUTCDATETIME()
          WHERE id = @id
        `);
    } else {
      await pool
        .request()
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('id_revue', sql.Int, idRevue)
        .input('cle_brouillon', sql.NVarChar(40), cle)
        .input('payload', sql.NVarChar(sql.MAX), payloadJson)
        .input('cree_par', sql.NChar(20), user)
        .input('modifie_par', sql.NChar(20), user)
        .query(`
          INSERT INTO lab_wizard_brouillons (
            code_client, id_revue, cle_brouillon, payload, cree_par, modifie_par
          )
          VALUES (
            @code_client, @id_revue, @cle_brouillon, @payload, @cree_par, @modifie_par
          )
        `);
    }

    return getWizardBrouillonLab(codeSafe, { id_revue: idRevue, mode: opts.mode });
  } catch (err) {
    if (err instanceof LabDossierError) throw err;
    if (isMissingTableError(err)) {
      throw new LabDossierError(
        'Module brouillon wizard non disponible en base (table lab_wizard_brouillons)',
        503,
      );
    }
    throw err;
  }
}

/**
 * @param {string} codeClient
 * @param {{ id_revue?: string|number|null, mode?: string|null }} opts
 */
export async function deleteWizardBrouillonLab(codeClient, opts = {}) {
  const codeSafe = normalizeCodeClient(codeClient);
  const cle = buildCleBrouillon(opts.id_revue, opts.mode);
  const pool = await poolPromise;

  try {
    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('cle_brouillon', sql.NVarChar(40), cle)
      .query(`
        DELETE FROM lab_wizard_brouillons
        OUTPUT DELETED.id
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(cle_brouillon)) = RTRIM(LTRIM(@cle_brouillon))
      `);

    const deleted = (result.recordset || []).length > 0;
    return { deleted, code_client: codeSafe, cle_brouillon: cle };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { deleted: false, code_client: codeSafe, cle_brouillon: cle, skipped: true };
    }
    throw err;
  }
}

/**
 * Nettoyage à la clôture / annulation de revue.
 * @param {string|number} idRevue
 */
export async function deleteWizardBrouillonByRevueLab(idRevue) {
  const id = parseEntityId(idRevue, 'id_revue');
  const pool = await poolPromise;

  try {
    const result = await pool
      .request()
      .input('id_revue', sql.Int, id)
      .input('cle_brouillon', sql.NVarChar(40), `revue:${id}`)
      .query(`
        DELETE FROM lab_wizard_brouillons
        OUTPUT DELETED.id
        WHERE id_revue = @id_revue
           OR RTRIM(LTRIM(cle_brouillon)) = RTRIM(LTRIM(@cle_brouillon))
      `);
    return { deleted: (result.recordset || []).length };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { deleted: 0, skipped: true };
    }
    throw err;
  }
}
