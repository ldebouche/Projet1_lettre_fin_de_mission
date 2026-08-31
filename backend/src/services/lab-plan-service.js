/**
 * Génération du plan de vigilance (catalogue Rf). Job revue réexporté.
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

export { scanRevueAnnuelleLab } from './lab-revues-service.js';

/**
 * Catalogue plan de vigilance — constante code (pas de table référentiel).
 * Uniquement les diligences Renforcées : les obligations « Standard »
 * (gel des avoirs, pièces KYC, fiche identification, programmation revue)
 * sont déjà couvertes par le wizard / la revue annuelle.
 */
const CATALOGUE_PLAN_VIGILANCE_RENFORCEE = [
  {
    intitule: 'Documenter le bénéficiaire effectif final',
    description: 'Remonter à la personne physique. Pièce d\'identité si manquante.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Demander un KBIS à jour',
    description: 'Si pièce périmée / manquante — relance sous délai court.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Qualifier l\'implantation à l\'étranger et justifier la relation',
    description: 'Note d\'analyse pays à risque si exposition hors UE / listes.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Note sur l\'origine des fonds et les flux intra-groupe',
    description: 'Si flux devises / sous-traitants hors UE / trésorerie groupe.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Approbation hiérarchique du responsable LAB',
    description: 'Validation de la poursuite en vigilance renforcée.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Examen renforcé des opérations atypiques',
    description: 'Art. L.561-10-2 CMF — lien vers écran Opérations atypiques.',
    type_diligence: 'Renforcee',
    delai_jours: null,
  },
];

/**
 * Génère (idempotent) le plan de vigilance d'un dossier :
 * uniquement si vigilance = Renforcee → événement PLAN_VIGILANCE
 * + diligences catalogue Renforcée (6).
 * Vigilance Standard → no-op (obligations déjà couvertes par wizard / revue).
 *
 * @param {string} codeClient
 * @param {{ id_evaluation?: number|null, userId?: string|null }} [options]
 * @returns {Promise<object>}
 */
export async function genererPlanVigilanceLab(codeClient, { id_evaluation = null, userId = null } = {}) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;
  const creePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const dossierRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT
          RTRIM(LTRIM(d.vigilance)) AS vigilance,
          RTRIM(LTRIM(d.id_responsable_lab)) AS id_responsable_lab,
          RTRIM(LTRIM(c.expert_comptable)) AS expert_comptable
        FROM lab_dossier d
        INNER JOIN clients c
          ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
      `);
    const dossierRow = dossierRes.recordset?.[0];
    if (!dossierRow) {
      throw new LabDossierError('Dossier LAB introuvable', 404);
    }

    const vigilanceRaw = cleanText(dossierRow.vigilance) || 'Standard';
    const vigilance = vigilanceRaw.toLowerCase().includes('renforc') ? 'Renforcee' : 'Standard';
    const idResponsable =
      cleanText(dossierRow.id_responsable_lab) || cleanText(dossierRow.expert_comptable) || creePar;

    if (vigilance !== 'Renforcee') {
      await transaction.rollback();
      return {
        code_client: codeSafe,
        id_evenement: null,
        evenement_cree: false,
        vigilance,
        id_evaluation: id_evaluation ?? null,
        nb_creees: 0,
        nb_sautees: 0,
        diligences_creees_ids: [],
        diligences_sautees: [],
        skipped_reason: 'vigilance_standard',
      };
    }

    const catalogue = [...CATALOGUE_PLAN_VIGILANCE_RENFORCEE];

    let eventRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 id
        FROM lab_evenements
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(type_evenement)) = N'PLAN_VIGILANCE'
          AND RTRIM(LTRIM(statut)) = N'Ouvert'
        ORDER BY id DESC
      `);

    let eventId = eventRes.recordset?.[0]?.id ?? null;
    let eventCreated = false;

    if (eventId == null) {
      const insertEvent = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'PLAN_VIGILANCE')
        .input('libelle', sql.NChar(200), defaultLibelleEvenement('PLAN_VIGILANCE'))
        .input('criticite', sql.NChar(10), 'Elevee')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, todayUtcDate())
        .input('id_responsable', sql.NChar(20), idResponsable)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_evenements (
            code_client, type_evenement, libelle, criticite, statut,
            date_evenement, id_responsable, cree_par, modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @code_client, @type_evenement, @libelle, @criticite, @statut,
            @date_evenement, @id_responsable, @cree_par, @cree_par
          )
        `);
      eventId = insertEvent.recordset?.[0]?.id;
      if (eventId == null) {
        throw new Error('INSERT lab_evenements PLAN_VIGILANCE sans id retourné');
      }
      eventCreated = true;
    }

    const existingDilRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT id, intitule, id_evenement
        FROM lab_diligences
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(statut)) <> N'Abandonnee'
      `);

    const existingKeys = new Set(
      (existingDilRes.recordset || [])
        .map((row) => normalizeIntituleKey(row.intitule))
        .filter(Boolean),
    );

    const today = todayUtcDate();
    const createdIds = [];
    const skipped = [];

    for (const item of catalogue) {
      const key = normalizeIntituleKey(item.intitule);
      if (!key || existingKeys.has(key)) {
        skipped.push(item.intitule);
        continue;
      }

      const dateEcheance =
        item.delai_jours == null ? null : addDaysUtc(today, item.delai_jours);

      const dilRes = await new sql.Request(transaction)
        .input('id_evenement', sql.Int, eventId)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('intitule', sql.NChar(200), item.intitule)
        .input('type_diligence', sql.NChar(50), item.type_diligence)
        .input('id_responsable', sql.NChar(20), idResponsable)
        .input('date_echeance', sql.Date, dateEcheance)
        .input('statut', sql.NChar(20), 'A_faire')
        .input('commentaires', sql.NVarChar(sql.MAX), item.description)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_diligences (
            id_evenement, code_client, intitule, type_diligence,
            id_responsable, date_echeance, statut, commentaires,
            cree_par, modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @id_evenement, @code_client, @intitule, @type_diligence,
            @id_responsable, @date_echeance, @statut, @commentaires,
            @cree_par, @cree_par
          )
        `);

      const dilId = dilRes.recordset?.[0]?.id;
      if (dilId != null) {
        createdIds.push(dilId);
        existingKeys.add(key);
      }
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'GENERATION_PLAN_VIGILANCE',
      entite: 'lab_evenements',
      idEntite: eventId,
      codeClient: codeSafe,
      detail: JSON.stringify({
        nb_creees: createdIds.length,
        nb_sautees: skipped.length,
        vigilance,
        id_evaluation: id_evaluation ?? null,
        id_evenement: eventId,
        evenement_cree: eventCreated,
      }),
    });

    await transaction.commit();

    return {
      code_client: codeSafe,
      id_evenement: eventId,
      evenement_cree: eventCreated,
      vigilance,
      id_evaluation: id_evaluation ?? null,
      nb_creees: createdIds.length,
      nb_sautees: skipped.length,
      diligences_creees_ids: createdIds,
      diligences_sautees: skipped,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
