/**
 * Paramétrage cabinet LAB (lab_parametrage + lab_arpec_*).
 * Extrait de labService.js — Phase 7.4 Vague 2 (DEV/code). Comportement inchangé.
 */

import { poolPromise, sql } from '../config/db.js';

import {
  LabDossierError,
  cleanText,
  formatCollaborateur,
  normalizeCriticite,
  yesNoUnknown,
  normalizeModeControle,
  normalizeStatutPiece,
  normalizeStatutRevue,
  normalizeNiveauRisque,
  normalizeComplexite,
  splitTextList,
  toNumberOrNull,
  normalizeNiveauRisqueForStorage,
  parseIsoDate,
  todayUtcDate,
  addMonthsUtc,
  addDaysUtc,
  normalizeIntituleKey,
  assertClientExists,
  assertDossierAbsent,
  assertCollaborateurExists,
  assertDossierExists,
  writeLabAuditLog,
  yesNoToDb,
  normalizeComplexiteForStorage,
  ensureEvenementAutoLab,
  parseEntityId,
  getAuditDossierLab,
  buildOptionalFilters,
  buildScopeClause,
  sqlIsClient,
  sqlIsProspect,
  assertDossierInScope,
  defaultLibelleEvenement,
  normalizeModulation,
  niveauRankForArpec,
  niveauArpecFromRank,
  periodiciteFromNiveau,
  normalizeSoumisIs,
} from './lab-utils.js';

function formatNiveauRisqueSiOui(value) {
  const clean = cleanText(value);
  if (!clean) return null;
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('eleve')) return 'Élevé';
  if (normalized.includes('moy')) return 'Moyen';
  return clean;
}

function parseOnOffRequired(value, fieldLabel) {
  const yn = yesNoUnknown(value);
  if (yn === 'Oui') return 'O';
  if (yn === 'Non') return 'N';
  throw new LabDossierError(`${fieldLabel} invalide (O/N)`, 400);
}

function parseNiveauRisqueSiOui(value) {
  const clean = cleanText(value);
  if (!clean) {
    throw new LabDossierError('niveau_risque_si_oui invalide (Moyen | Élevé)', 400);
  }
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized === 'moyen') return 'Moyen';
  if (normalized === 'eleve') return 'Élevé';
  throw new LabDossierError('niveau_risque_si_oui invalide (Moyen | Élevé)', 400);
}

function parseParamValeur(value) {
  if (value == null) {
    throw new LabDossierError('valeur obligatoire', 400);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    throw new LabDossierError('valeur obligatoire', 400);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new LabDossierError('valeur obligatoire', 400);
  }
  return trimmed;
}

function parseOrdreAffichage(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new LabDossierError('ordre_affichage invalide', 400);
  }
  return n;
}

function asArrayOrThrow(value, fieldName) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new LabDossierError(`${fieldName} doit être un tableau`, 400);
  }
  return value;
}

/**
 * Paramétrage cabinet (Écran 11) : lab_parametrage + référentiel ARPEC.
 * Toutes les versions de code_param sont renvoyées (historique) ; le FE édite
 * la plus récente actif=O, sinon la plus haute version.
 */
export async function getParametrageLab() {
  const pool = await poolPromise;
  let paramsResult;
  let axesResult;
  let questionsResult;
  try {
    [paramsResult, axesResult, questionsResult] = await Promise.all([
      pool.request().query(`
        SELECT id, code_param, libelle, valeur, version, actif, date_modification, modifie_par
        FROM lab_parametrage
        ORDER BY code_param ASC, version DESC
      `),
      pool.request().query(`
        SELECT id, code, libelle, ordre_affichage, actif
        FROM lab_arpec_axes
        ORDER BY ISNULL(ordre_affichage, 999), code, id
      `),
      pool.request().query(`
        SELECT
          q.id,
          q.id_axe,
          a.code AS axe_code,
          q.sous_axe,
          q.code_question,
          q.libelle,
          q.niveau_risque_si_oui,
          q.est_declencheur,
          q.reference_arpec,
          q.ordre_affichage,
          q.actif,
          q.version
        FROM lab_arpec_questions q
        INNER JOIN lab_arpec_axes a ON a.id = q.id_axe
        ORDER BY ISNULL(a.ordre_affichage, 999), ISNULL(q.ordre_affichage, 999), q.id
      `),
    ]);
  } catch (err) {
    if (err?.number === 208) {
      throw new LabDossierError(
        'Module paramétrage LAB non disponible en base (tables lab_parametrage / lab_arpec_*)',
        503,
      );
    }
    throw err;
  }

  return {
    parametrage: (paramsResult.recordset || []).map((row) => ({
      id: row.id,
      code_param: cleanText(row.code_param),
      libelle: cleanText(row.libelle),
      valeur: cleanText(row.valeur),
      version: row.version ?? null,
      actif: yesNoUnknown(row.actif),
      date_modification: row.date_modification ?? null,
      modifie_par: cleanText(row.modifie_par),
    })),
    axes: (axesResult.recordset || []).map((row) => ({
      id: row.id,
      code: cleanText(row.code),
      libelle: cleanText(row.libelle),
      ordre_affichage: row.ordre_affichage ?? null,
      actif: yesNoUnknown(row.actif),
    })),
    questions: (questionsResult.recordset || []).map((row) => ({
      id: row.id,
      id_axe: row.id_axe,
      axe_code: cleanText(row.axe_code),
      sous_axe: cleanText(row.sous_axe),
      code_question: cleanText(row.code_question),
      libelle: cleanText(row.libelle),
      niveau_risque_si_oui: formatNiveauRisqueSiOui(row.niveau_risque_si_oui),
      est_declencheur: yesNoUnknown(row.est_declencheur),
      reference_arpec: cleanText(row.reference_arpec),
      ordre_affichage: row.ordre_affichage ?? null,
      actif: yesNoUnknown(row.actif),
      version: row.version ?? null,
    })),
  };
}

/**
 * Met à jour le paramétrage cabinet : versioning de lab_parametrage + UPDATE
 * des questions ARPEC (id_axe / code_question immuables).
 */
export async function updateParametrageLab(body = {}, userId = null) {
  const parametrageItems = asArrayOrThrow(body.parametrage, 'parametrage');
  const questionItems = asArrayOrThrow(body.questions, 'questions');
  if (parametrageItems.length === 0 && questionItems.length === 0) {
    throw new LabDossierError('Au moins un tableau parametrage ou questions est requis', 400);
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const parametrageCodes = [];
  const questionsIds = [];

  try {
    if (parametrageItems.length > 0) {
      const existingRes = await new sql.Request(transaction).query(`
        SELECT id, code_param, libelle, valeur, version, actif
        FROM lab_parametrage
      `);
      const byCode = new Map();
      for (const row of existingRes.recordset || []) {
        const code = cleanText(row.code_param);
        if (!code) continue;
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push(row);
      }

      const byIncomingCode = new Map();
      for (const item of parametrageItems) {
        const code = cleanText(item?.code_param);
        if (!code) {
          throw new LabDossierError('code_param requis', 400);
        }
        const valeur = parseParamValeur(item?.valeur);
        byIncomingCode.set(code, valeur);
      }

      for (const [code, valeur] of byIncomingCode.entries()) {
        const rows = byCode.get(code);
        if (!rows?.length) {
          throw new LabDossierError(`code_param inconnu: ${code}`, 400);
        }

        const activeRows = rows.filter((r) => yesNoUnknown(r.actif) === 'Oui');
        const latest = [...(activeRows.length ? activeRows : rows)]
          .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
        const currentValeur = latest.valeur == null ? '' : String(latest.valeur).trim();
        if (currentValeur === valeur) {
          continue;
        }
        parametrageCodes.push(code);

        const nextVersion = Math.max(...rows.map((r) => r.version ?? 0)) + 1;
        const libelleConserve = latest.libelle ?? null;

        await new sql.Request(transaction)
          .input('code_param', sql.NVarChar(50), code)
          .query(`
            UPDATE lab_parametrage
            SET actif = N'N'
            WHERE RTRIM(LTRIM(code_param)) = RTRIM(LTRIM(@code_param))
          `);

        await new sql.Request(transaction)
          .input('code_param', sql.NChar(50), code)
          .input('libelle', sql.NChar(200), libelleConserve)
          .input('valeur', sql.NVarChar(sql.MAX), valeur)
          .input('version', sql.Int, nextVersion)
          .input('modifie_par', sql.NChar(20), cleanText(userId))
          .query(`
            INSERT INTO lab_parametrage (
              code_param,
              libelle,
              valeur,
              version,
              actif,
              date_modification,
              modifie_par
            )
            VALUES (
              @code_param,
              @libelle,
              @valeur,
              @version,
              N'O',
              SYSUTCDATETIME(),
              @modifie_par
            )
          `);
      }
    }

    if (questionItems.length > 0) {
      const byId = new Map();
      for (const item of questionItems) {
        const id = Number(item?.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new LabDossierError('id question invalide', 400);
        }
        byId.set(id, item);
      }

      for (const [id, item] of byId.entries()) {
        const existing = await new sql.Request(transaction)
          .input('id', sql.Int, id)
          .query(`
            SELECT id, libelle, est_declencheur, niveau_risque_si_oui, actif, ordre_affichage, version
            FROM lab_arpec_questions
            WHERE id = @id
          `);
        const row = existing.recordset?.[0];
        if (!row) {
          throw new LabDossierError(`id question inconnu: ${id}`, 400);
        }

        const sets = [];
        const request = new sql.Request(transaction).input('id', sql.Int, id);

        if (Object.prototype.hasOwnProperty.call(item, 'libelle')) {
          const libelle = cleanText(item.libelle);
          if (!libelle) {
            throw new LabDossierError('libelle question requis', 400);
          }
          if (libelle !== cleanText(row.libelle)) {
            request.input('libelle', sql.NVarChar(sql.MAX), libelle);
            sets.push('libelle = @libelle');
          }
        }
        if (Object.prototype.hasOwnProperty.call(item, 'est_declencheur')) {
          const flag = parseOnOffRequired(item.est_declencheur, 'est_declencheur');
          const current = yesNoUnknown(row.est_declencheur) === 'Oui' ? 'O' : 'N';
          if (flag !== current) {
            request.input('est_declencheur', sql.NChar(1), flag);
            sets.push('est_declencheur = @est_declencheur');
          }
        }
        if (Object.prototype.hasOwnProperty.call(item, 'niveau_risque_si_oui')) {
          const niveau = parseNiveauRisqueSiOui(item.niveau_risque_si_oui);
          if (niveau !== formatNiveauRisqueSiOui(row.niveau_risque_si_oui)) {
            request.input('niveau_risque_si_oui', sql.NChar(10), niveau);
            sets.push('niveau_risque_si_oui = @niveau_risque_si_oui');
          }
        }
        if (Object.prototype.hasOwnProperty.call(item, 'actif')) {
          const flag = parseOnOffRequired(item.actif, 'actif');
          const current = yesNoUnknown(row.actif) === 'Oui' ? 'O' : 'N';
          if (flag !== current) {
            request.input('actif', sql.NChar(1), flag);
            sets.push('actif = @actif');
          }
        }
        if (Object.prototype.hasOwnProperty.call(item, 'ordre_affichage')) {
          const ordre = parseOrdreAffichage(item.ordre_affichage);
          const currentOrdre = row.ordre_affichage == null ? null : Number(row.ordre_affichage);
          if (ordre !== currentOrdre) {
            request.input('ordre_affichage', sql.Int, ordre);
            sets.push('ordre_affichage = @ordre_affichage');
          }
        }

        if (sets.length === 0) {
          continue;
        }
        questionsIds.push(id);
        sets.push('version = ISNULL(version, 0) + 1');

        await request.query(`
          UPDATE lab_arpec_questions
          SET ${sets.join(', ')}
          WHERE id = @id
        `);
      }
    }

    if (parametrageCodes.length === 0 && questionsIds.length === 0) {
      await transaction.rollback();
    } else {
      await writeLabAuditLog(transaction, {
        userId: cleanText(userId),
        typeAction: 'MODIF_PARAMETRAGE',
        entite: 'lab_parametrage',
        idEntite: null,
        codeClient: null,
        detail: JSON.stringify({
          parametrage_codes: parametrageCodes,
          questions_ids: questionsIds,
        }),
      });
      await transaction.commit();
    }
  } catch (err) {
    await transaction.rollback();
    if (err?.number === 208) {
      throw new LabDossierError(
        'Module paramétrage LAB non disponible en base (tables lab_parametrage / lab_arpec_*)',
        503,
      );
    }
    throw err;
  }

  return getParametrageLab();
}
