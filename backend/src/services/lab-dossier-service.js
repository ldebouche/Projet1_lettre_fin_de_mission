/**
 * Dossier / client / résumé / agrégateur GET /dossier.
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

import { getKycDossierLab, getBeneficiairesDossierLab } from './lab-kyc-service.js';

import { getPiecesDossierLab } from './lab-pieces-service.js';

import { getEvenementsDossierLab } from './lab-evenements-service.js';

import { getDiligencesDossierLab } from './lab-diligences-service.js';

import { getRevuesDossierLab, getRevueEnCours } from './lab-revues-service.js';

import { getRisqueHistoriqueDossierLab } from './lab-arpec-service.js';

/**
 * Agrégats risque / KYC / événements pour une liste de codes clients (accès par code).
 * @param {string[]} codesClients
 * @returns {Promise<Map<string, object>>}
 */
export async function getDossiersRisque(codesClients, scope = { isFull: true, idSellsy: null }) {
  try {
    if (!Array.isArray(codesClients) || codesClients.length === 0) {
      return new Map();
    }

    const codesCsv = codesClients.map((c) => String(c).trim()).filter(Boolean).join(',');
    if (!codesCsv) {
      return new Map();
    }

    const pool = await poolPromise;
    const scopeClause = buildScopeClause(scope, 'd.code_client');
    const query = `
      SELECT
        d.code_client,
        d.niveau_risque,
        d.statut_kyc,
        d.date_derniere_revue,
        d.date_prochaine_revue,
        d.statut_dossier,
        (SELECT COUNT(*) FROM lab_evenements e
         WHERE e.code_client = d.code_client
         AND e.statut != 'Cloture') AS nb_evenements_ouverts,
        (SELECT COUNT(*) FROM lab_diligences di
         WHERE di.code_client = d.code_client
         AND di.statut = 'A_faire'
         AND di.date_echeance < GETDATE()) AS nb_diligences_retard
      FROM lab_dossier d
      WHERE d.code_client IN (SELECT value FROM STRING_SPLIT(@codesClients, ','))
      ${scopeClause ? `AND ${scopeClause.clause}` : ''}
    `;

    const request = pool
      .request()
      .input('codesClients', sql.NVarChar(sql.MAX), codesCsv);
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
    }
    const result = await request.query(query);

    const map = new Map();
    for (const row of result.recordset || []) {
      const key = row.code_client != null ? String(row.code_client).trim() : '';
      if (!key) continue;
      map.set(key, {
        code_client: key,
        niveau_risque: row.niveau_risque != null ? String(row.niveau_risque).trim() : null,
        statut_kyc: row.statut_kyc != null ? String(row.statut_kyc).trim() : null,
        date_derniere_revue: row.date_derniere_revue ?? null,
        date_prochaine_revue: row.date_prochaine_revue ?? null,
        statut_dossier: row.statut_dossier != null ? String(row.statut_dossier).trim() : null,
        nb_evenements_ouverts: row.nb_evenements_ouverts ?? 0,
        nb_diligences_retard: row.nb_diligences_retard ?? 0,
      });
    }

    return map;
  } catch (err) {
    console.error('Erreur getDossiersRisque:', err);
    throw err;
  }
}

/**
 * Résumé LAB pour un client (une ligne lab_dossier + agrégats événements / diligences).
 * @param {string} codeClient
 * @returns {Promise<object|null>}
 */
export async function getResumeLab(codeClient) {
  try {
    const code = codeClient != null ? String(codeClient).trim() : '';
    if (!code) {
      return null;
    }

    const pool = await poolPromise;
    const query = `
      SELECT
        d.code_client,
        d.niveau_risque,
        d.statut_dossier,
        d.statut_kyc,
        d.date_prochaine_revue,
        (SELECT COUNT(*)
         FROM lab_evenements e
         WHERE e.code_client = d.code_client
           AND e.statut != 'Cloture') AS nb_evenements_ouverts,
        (SELECT COUNT(*)
         FROM lab_diligences di
         WHERE di.code_client = d.code_client
           AND di.date_echeance IS NOT NULL
           AND di.date_echeance < CAST(GETDATE() AS DATE)
           AND di.statut NOT IN ('Realisee', 'Abandonnee')) AS nb_diligences_retard
      FROM lab_dossier d
      WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
    `;

    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), code.length > 10 ? code.slice(0, 10) : code)
      .query(query);

    const row = result.recordset?.[0];
    if (!row) {
      return null;
    }

    const key = row.code_client != null ? String(row.code_client).trim() : code;

    return {
      code_client: key,
      niveau_risque: row.niveau_risque != null ? String(row.niveau_risque).trim() : null,
      statut_dossier: row.statut_dossier != null ? String(row.statut_dossier).trim() : null,
      statut_kyc: row.statut_kyc != null ? String(row.statut_kyc).trim() : null,
      date_prochaine_revue: row.date_prochaine_revue ?? null,
      nb_evenements_ouverts: row.nb_evenements_ouverts ?? 0,
      nb_diligences_retard: row.nb_diligences_retard ?? 0,
    };
  } catch (err) {
    console.error('Erreur getResumeLab:', err);
    throw err;
  }
}

/**
 * Crée un dossier LAB pour un client existant (transaction : dossier + audit + événement).
 * @param {{ code_client: string, lab?: object, options?: { creer_evenement_entree?: boolean } }} payload
 * @param {string|null} userId id_sellsy du collaborateur authentifié
 * @returns {Promise<object>} même shape que getDossierLab
 */
export async function createDossierLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;

  const labInput = payload.lab && typeof payload.lab === 'object' ? payload.lab : {};
  const creerEvenementEntree = payload.options?.creer_evenement_entree !== false;

  const statutDossier = cleanText(labInput.statut_dossier) || 'Actif';
  const niveauRisque = normalizeNiveauRisqueForStorage(labInput.niveau_risque);
  const statutKyc = cleanText(labInput.statut_kyc) || 'Incomplet';
  const periodiciteRevueMois = toNumberOrNull(labInput.periodicite_revue_mois) ?? 12;
  if (!Number.isInteger(periodiciteRevueMois) || periodiciteRevueMois < 1) {
    throw new LabDossierError('periodicite_revue_mois invalide', 400);
  }

  const scoreRisqueGlobal = labInput.score_risque_global != null
    ? toNumberOrNull(labInput.score_risque_global)
    : null;
  if (labInput.score_risque_global != null && scoreRisqueGlobal == null) {
    throw new LabDossierError('score_risque_global invalide', 400);
  }

  const idResponsableLab = cleanText(labInput.id_responsable_lab);
  const creePar = cleanText(userId);

  const dateEntreeRelation = labInput.date_entree_relation != null
    ? parseIsoDate(labInput.date_entree_relation)
    : todayUtcDate();
  if (dateEntreeRelation === undefined) {
    throw new LabDossierError('date_entree_relation invalide', 400);
  }
  const dateEntree = dateEntreeRelation ?? todayUtcDate();

  let dateDerniereRevue = null;
  if (labInput.date_derniere_revue != null && String(labInput.date_derniere_revue).trim() !== '') {
    dateDerniereRevue = parseIsoDate(labInput.date_derniere_revue);
    if (dateDerniereRevue === undefined) {
      throw new LabDossierError('date_derniere_revue invalide', 400);
    }
  }

  let dateProchaineRevue = null;
  if (labInput.date_prochaine_revue != null && String(labInput.date_prochaine_revue).trim() !== '') {
    dateProchaineRevue = parseIsoDate(labInput.date_prochaine_revue);
    if (dateProchaineRevue === undefined) {
      throw new LabDossierError('date_prochaine_revue invalide', 400);
    }
  } else {
    dateProchaineRevue = addMonthsUtc(dateEntree, periodiciteRevueMois);
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierAbsent(transaction, codeSafe);
    if (idResponsableLab) {
      await assertCollaborateurExists(transaction, idResponsableLab, 'collaborateur');
    }

    const insertDossier = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('statut_dossier', sql.NChar(20), statutDossier)
      .input('niveau_risque', sql.NChar(10), niveauRisque)
      .input('score_risque_global', sql.Decimal(8, 2), scoreRisqueGlobal)
      .input('id_responsable_lab', sql.NChar(20), idResponsableLab)
      .input('date_entree_relation', sql.Date, dateEntree)
      .input('date_derniere_revue', sql.Date, dateDerniereRevue)
      .input('date_prochaine_revue', sql.Date, dateProchaineRevue)
      .input('periodicite_revue_mois', sql.Int, periodiciteRevueMois)
      .input('statut_kyc', sql.NChar(20), statutKyc)
      .input('cree_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_dossier (
          code_client,
          statut_dossier,
          niveau_risque,
          score_risque_global,
          id_responsable_lab,
          date_entree_relation,
          date_derniere_revue,
          date_prochaine_revue,
          periodicite_revue_mois,
          statut_kyc,
          cree_par,
          modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client,
          @statut_dossier,
          @niveau_risque,
          @score_risque_global,
          @id_responsable_lab,
          @date_entree_relation,
          @date_derniere_revue,
          @date_prochaine_revue,
          @periodicite_revue_mois,
          @statut_kyc,
          @cree_par,
          @cree_par
        )
      `);

    const dossierId = insertDossier.recordset?.[0]?.id;
    if (dossierId == null) {
      throw new Error('INSERT lab_dossier sans id retourné');
    }

    const auditDetail = JSON.stringify({
      niveau_risque: niveauRisque,
      id_responsable_lab: idResponsableLab,
      source: 'wizard',
    });

    await new sql.Request(transaction)
      .input('id_utilisateur', sql.NChar(20), creePar)
      .input('id_entite', sql.NVarChar(50), String(dossierId))
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('detail', sql.NVarChar(sql.MAX), auditDetail)
      .query(`
        INSERT INTO lab_audit_log (
          id_utilisateur,
          type_action,
          entite,
          id_entite,
          code_client,
          detail
        )
        VALUES (
          @id_utilisateur,
          N'CREATION_DOSSIER',
          N'lab_dossier',
          @id_entite,
          @code_client,
          @detail
        )
      `);

    if (creerEvenementEntree) {
      const eventResponsable = idResponsableLab || creePar;
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'ENTREE_RELATION')
        .input('libelle', sql.NChar(200), 'Entrée en relation')
        .input('criticite', sql.NChar(10), 'Moyenne')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, dateEntree)
        .input('id_responsable', sql.NChar(20), eventResponsable)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_evenements (
            code_client,
            type_evenement,
            libelle,
            criticite,
            statut,
            date_evenement,
            id_responsable,
            cree_par,
            modifie_par
          )
          VALUES (
            @code_client,
            @type_evenement,
            @libelle,
            @criticite,
            @statut,
            @date_evenement,
            @id_responsable,
            @cree_par,
            @cree_par
          )
        `);
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const data = await getDossierLab(codeSafe);
  if (!data?.lab) {
    throw new Error('Dossier créé mais lecture impossible');
  }
  return data;
}

/**
 * Met à jour un dossier LAB existant (champs administratifs du wizard, étape 1).
 */
export async function updateDossierLab(codeClient, payload, userId = null) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const labInput = payload?.lab && typeof payload.lab === 'object' ? payload.lab : {};
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    const dossierId = await assertDossierExists(transaction, codeSafe);
    const revueEnCours = await getRevueEnCours(transaction, codeSafe);

    const idResponsableLab = labInput.id_responsable_lab != null
      ? cleanText(labInput.id_responsable_lab)
      : undefined;
    if (idResponsableLab) {
      await assertCollaborateurExists(transaction, idResponsableLab, 'collaborateur');
    }

    const sets = ['date_modification = SYSUTCDATETIME()', 'modifie_par = @modifie_par'];
    const request = new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('modifie_par', sql.NChar(20), modifiePar);

    if (labInput.statut_dossier != null) {
      request.input('statut_dossier', sql.NChar(20), cleanText(labInput.statut_dossier) || 'Actif');
      sets.push('statut_dossier = @statut_dossier');
    }
    if (labInput.statut_kyc != null) {
      request.input('statut_kyc', sql.NChar(20), cleanText(labInput.statut_kyc) || 'Incomplet');
      sets.push('statut_kyc = @statut_kyc');
    }
    if (idResponsableLab !== undefined) {
      request.input('id_responsable_lab', sql.NChar(20), idResponsableLab);
      sets.push('id_responsable_lab = @id_responsable_lab');
    }
    if (labInput.date_entree_relation != null && String(labInput.date_entree_relation).trim() !== '') {
      const dateEntree = parseIsoDate(labInput.date_entree_relation);
      if (dateEntree === undefined) {
        throw new LabDossierError('date_entree_relation invalide', 400);
      }
      request.input('date_entree_relation', sql.Date, dateEntree);
      sets.push('date_entree_relation = @date_entree_relation');
    }
    if (!revueEnCours && labInput.date_derniere_revue != null && String(labInput.date_derniere_revue).trim() !== '') {
      const dateDerniere = parseIsoDate(labInput.date_derniere_revue);
      if (dateDerniere === undefined) {
        throw new LabDossierError('date_derniere_revue invalide', 400);
      }
      request.input('date_derniere_revue', sql.Date, dateDerniere);
      sets.push('date_derniere_revue = @date_derniere_revue');
    }
    if (!revueEnCours && labInput.date_prochaine_revue != null && String(labInput.date_prochaine_revue).trim() !== '') {
      const dateProchaine = parseIsoDate(labInput.date_prochaine_revue);
      if (dateProchaine === undefined) {
        throw new LabDossierError('date_prochaine_revue invalide', 400);
      }
      request.input('date_prochaine_revue', sql.Date, dateProchaine);
      sets.push('date_prochaine_revue = @date_prochaine_revue');
    }
    if (labInput.periodicite_revue_mois != null) {
      const periodicite = toNumberOrNull(labInput.periodicite_revue_mois);
      if (!Number.isInteger(periodicite) || periodicite < 1) {
        throw new LabDossierError('periodicite_revue_mois invalide', 400);
      }
      request.input('periodicite_revue_mois', sql.Int, periodicite);
      sets.push('periodicite_revue_mois = @periodicite_revue_mois');
    }

    await request.query(`
      UPDATE lab_dossier
      SET ${sets.join(', ')}
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_DOSSIER',
      entite: 'lab_dossier',
      idEntite: dossierId,
      codeClient: codeSafe,
      detail: JSON.stringify({ source: 'wizard', champs: Object.keys(labInput) }),
    });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const data = await getDossierLab(codeSafe);
  if (!data?.lab) {
    throw new Error('Dossier mis à jour mais lecture impossible');
  }
  return data;
}

/**
 * Met à jour les champs identité / coordonnées / fiscal de la table clients (wizard étape 1, D2.2-A).
 * Le code_client est immuable (passé en query, jamais dans le body).
 */
export async function updateClientLab(codeClient, payload, userId = null) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const clientInput = payload?.client && typeof payload.client === 'object' ? payload.client : {};
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);

    const sets = [];
    const request = new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe);

    const assignText = (field, sqlType, value, maxLen) => {
      if (value === undefined) return;
      const param = `c_${field}`;
      const clean = value == null || String(value).trim() === ''
        ? null
        : cleanText(value);
      const truncated = clean != null && maxLen != null && clean.length > maxLen
        ? clean.slice(0, maxLen)
        : clean;
      request.input(param, sqlType, truncated);
      sets.push(`${field} = @${param}`);
    };

    assignText('siret', sql.NChar(17), clientInput.siret, 17);
    assignText('raison_sociale', sql.NChar(100), clientInput.raison_sociale, 100);
    assignText('forme_societe', sql.NChar(30), clientInput.forme_societe, 30);
    assignText('rcs', sql.NChar(50), clientInput.rcs, 50);
    assignText('ape', sql.NChar(10), clientInput.ape, 10);
    assignText('activite', sql.NChar(100), clientInput.activite, 100);
    assignText('nature', sql.NChar(50), clientInput.nature, 50);
    assignText('tvaintracom', sql.NChar(20), clientInput.tvaintracom, 20);
    assignText('adr1_siege', sql.NChar(50), clientInput.adr1_siege, 50);
    assignText('adr2_siege', sql.NChar(50), clientInput.adr2_siege, 50);
    assignText('cpos_siege', sql.NChar(10), clientInput.cpos_siege, 10);
    assignText('ville_siege', sql.NChar(50), clientInput.ville_siege, 50);
    assignText('tel_fixe', sql.NChar(20), clientInput.tel_fixe, 20);
    assignText('tel_portable', sql.NChar(20), clientInput.tel_portable, 20);
    assignText('email', sql.NChar(100), clientInput.email, 100);
    assignText('regime_fiscal', sql.NChar(30), clientInput.regime_fiscal, 30);
    assignText('logiciel_compta', sql.NChar(50), clientInput.logiciel_compta, 50);

    if (clientInput.soumis_is !== undefined) {
      const soumis = normalizeSoumisIs(clientInput.soumis_is);
      request.input('c_soumis_is', sql.NChar(1), soumis);
      sets.push('soumis_is = @c_soumis_is');
    }

    if (clientInput.montant_capital_social !== undefined) {
      const capital = clientInput.montant_capital_social == null
        || String(clientInput.montant_capital_social).trim() === ''
        ? null
        : toNumberOrNull(clientInput.montant_capital_social);
      request.input('c_montant_capital_social', sql.Decimal(18, 2), capital);
      sets.push('montant_capital_social = @c_montant_capital_social');
    }

    if (clientInput.mois_cloture !== undefined) {
      const moisRaw = clientInput.mois_cloture;
      const mois = moisRaw == null || String(moisRaw).trim() === ''
        ? null
        : toNumberOrNull(moisRaw);
      if (mois != null && (!Number.isInteger(mois) || mois < 1 || mois > 12)) {
        throw new LabDossierError('mois_cloture invalide (1-12)', 400);
      }
      request.input('c_mois_cloture', sql.Int, mois);
      sets.push('mois_cloture = @c_mois_cloture');
    }

    if (clientInput.date_entree_cabinet !== undefined) {
      if (clientInput.date_entree_cabinet == null || String(clientInput.date_entree_cabinet).trim() === '') {
        request.input('c_date_entree_cabinet', sql.Date, null);
        sets.push('date_entree_cabinet = @c_date_entree_cabinet');
      } else {
        const dateEntree = parseIsoDate(clientInput.date_entree_cabinet);
        if (dateEntree === undefined) {
          throw new LabDossierError('date_entree_cabinet invalide', 400);
        }
        request.input('c_date_entree_cabinet', sql.Date, dateEntree);
        sets.push('date_entree_cabinet = @c_date_entree_cabinet');
      }
    }

    if (clientInput.expert_comptable !== undefined) {
      const expert = cleanText(clientInput.expert_comptable);
      if (expert) {
        await assertCollaborateurExists(transaction, expert, 'expert_comptable');
      }
      request.input('c_expert_comptable', sql.NChar(20), expert);
      sets.push('expert_comptable = @c_expert_comptable');
    }

    if (clientInput.chef_de_mission !== undefined) {
      const chef = cleanText(clientInput.chef_de_mission);
      if (chef) {
        await assertCollaborateurExists(transaction, chef, 'chef_de_mission');
      }
      request.input('c_chef_de_mission', sql.NChar(20), chef);
      sets.push('chef_de_mission = @c_chef_de_mission');
    }

    if (sets.length === 0) {
      throw new LabDossierError('Aucun champ client à mettre à jour', 400);
    }

    await request.query(`
      UPDATE clients
      SET ${sets.join(', ')}
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_CLIENT',
      entite: 'clients',
      idEntite: codeSafe,
      codeClient: codeSafe,
      detail: JSON.stringify({ source: 'wizard', champs: Object.keys(clientInput) }),
    });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const data = await getDossierLab(codeSafe);
  if (!data?.client) {
    throw new Error('Client mis à jour mais lecture impossible');
  }
  return data.client;
}

/**
 * Fiche dossier LAB pour l'écran /lab/dossier.
 * Jointure lab_dossier + clients pour remonter à la fois les infos client
 * (identité, coordonnées, juridique/fiscal, équipe cabinet) et les données LAB
 * (statuts, risque, revue) enrichies des agrégats événements / diligences.
 *
 * @param {string} codeClient
 * @returns {Promise<{ client: object, lab: object }|null>}
 */
export async function getDossierLab(codeClient) {
  try {
    const code = codeClient != null ? String(codeClient).trim() : '';
    if (!code) {
      return null;
    }

    const pool = await poolPromise;
    const query = `
      SELECT
        -- Identification
        c.code_client,

        -- Bloc client (issu de la table clients)
        c.raison_sociale            AS c_raison_sociale,
        c.forme_societe             AS c_forme_societe,
        c.siret                     AS c_siret,
        c.ape                       AS c_ape,
        c.activite                  AS c_activite,
        c.nature                    AS c_nature,
        c.rcs                       AS c_rcs,
        c.tvaintracom               AS c_tvaintracom,
        c.montant_capital_social    AS c_montant_capital_social,
        c.date_entree_cabinet       AS c_date_entree_cabinet,
        c.adr1_siege                AS c_adr1_siege,
        c.adr2_siege                AS c_adr2_siege,
        c.cpos_siege                AS c_cpos_siege,
        c.ville_siege               AS c_ville_siege,
        c.tel_fixe                  AS c_tel_fixe,
        c.tel_portable              AS c_tel_portable,
        c.email                     AS c_email,
        c.regime_fiscal             AS c_regime_fiscal,
        c.soumis_is                 AS c_soumis_is,
        c.mois_cloture              AS c_mois_cloture,
        c.logiciel_compta           AS c_logiciel_compta,
        c.expert_comptable          AS c_expert_comptable,
        c.chef_de_mission           AS c_chef_de_mission,

        -- Noms des collaborateurs (expert-comptable, chef de mission, responsable LAB)
        collab_exp.nom              AS c_expert_comptable_nom,
        collab_exp.prenom           AS c_expert_comptable_prenom,
        collab_chef.nom             AS c_chef_de_mission_nom,
        collab_chef.prenom          AS c_chef_de_mission_prenom,
        collab_lab.nom              AS l_responsable_lab_nom,
        collab_lab.prenom           AS l_responsable_lab_prenom,

        -- Bloc lab_dossier (toutes les colonnes utiles pour l'écran)
        d.id                        AS l_id,
        d.statut_dossier            AS l_statut_dossier,
        d.niveau_risque             AS l_niveau_risque,
        d.vigilance                 AS l_vigilance,
        d.id_responsable_lab        AS l_id_responsable_lab,
        d.date_entree_relation      AS l_date_entree_relation,
        d.date_derniere_revue       AS l_date_derniere_revue,
        d.date_prochaine_revue      AS l_date_prochaine_revue,
        d.periodicite_revue_mois    AS l_periodicite_revue_mois,
        d.statut_kyc                AS l_statut_kyc,
        d.date_creation             AS l_date_creation,
        d.date_modification         AS l_date_modification,
        d.cree_par                  AS l_cree_par,
        d.modifie_par               AS l_modifie_par,

        -- Agrégats (mêmes règles que getResumeLab)
        (SELECT COUNT(*)
         FROM lab_evenements e
         WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
           AND e.statut != 'Cloture') AS l_nb_evenements_ouverts,
        (SELECT COUNT(*)
         FROM lab_diligences di
         WHERE RTRIM(LTRIM(di.code_client)) = RTRIM(LTRIM(@code_client))
           AND di.date_echeance IS NOT NULL
           AND di.date_echeance < CAST(GETDATE() AS DATE)
           AND di.statut NOT IN ('Realisee', 'Abandonnee')) AS l_nb_diligences_retard
      FROM clients c
      LEFT JOIN lab_dossier d
        ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs collab_exp
        ON RTRIM(LTRIM(collab_exp.id_sellsy)) = RTRIM(LTRIM(c.expert_comptable))
      LEFT JOIN collaborateurs collab_chef
        ON RTRIM(LTRIM(collab_chef.id_sellsy)) = RTRIM(LTRIM(c.chef_de_mission))
      LEFT JOIN collaborateurs collab_lab
        ON RTRIM(LTRIM(collab_lab.id_sellsy)) = RTRIM(LTRIM(d.id_responsable_lab))
      WHERE RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(@code_client))
    `;

    const codeSafe = code.length > 10 ? code.slice(0, 10) : code;
    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(query);

    const row = result.recordset?.[0];
    if (!row) {
      return null;
    }

    const key = row.code_client != null ? String(row.code_client).trim() : code;

    const client = {
      code_client: key,
      raison_sociale: cleanText(row.c_raison_sociale),
      forme_societe: cleanText(row.c_forme_societe),
      siret: cleanText(row.c_siret),
      ape: cleanText(row.c_ape),
      activite: cleanText(row.c_activite),
      nature: cleanText(row.c_nature),
      rcs: cleanText(row.c_rcs),
      tvaintracom: cleanText(row.c_tvaintracom),
      montant_capital_social: row.c_montant_capital_social ?? null,
      date_entree_cabinet: row.c_date_entree_cabinet ?? null,
      adr1_siege: cleanText(row.c_adr1_siege),
      adr2_siege: cleanText(row.c_adr2_siege),
      cpos_siege: cleanText(row.c_cpos_siege),
      ville_siege: cleanText(row.c_ville_siege),
      tel_fixe: cleanText(row.c_tel_fixe),
      tel_portable: cleanText(row.c_tel_portable),
      email: cleanText(row.c_email),
      regime_fiscal: cleanText(row.c_regime_fiscal),
      soumis_is: cleanText(row.c_soumis_is),
      mois_cloture: row.c_mois_cloture ?? null,
      logiciel_compta: cleanText(row.c_logiciel_compta),
      expert_comptable: cleanText(row.c_expert_comptable),
      expert_comptable_nom: cleanText(row.c_expert_comptable_nom),
      expert_comptable_prenom: cleanText(row.c_expert_comptable_prenom),
      chef_de_mission: cleanText(row.c_chef_de_mission),
      chef_de_mission_nom: cleanText(row.c_chef_de_mission_nom),
      chef_de_mission_prenom: cleanText(row.c_chef_de_mission_prenom),
    };

    const lab = row.l_id != null ? {
      id: row.l_id ?? null,
      code_client: key,
      statut_dossier: cleanText(row.l_statut_dossier),
      niveau_risque: cleanText(row.l_niveau_risque),
      vigilance: cleanText(row.l_vigilance),
      id_responsable_lab: cleanText(row.l_id_responsable_lab),
      responsable_lab_nom: cleanText(row.l_responsable_lab_nom),
      responsable_lab_prenom: cleanText(row.l_responsable_lab_prenom),
      date_entree_relation: row.l_date_entree_relation ?? null,
      date_derniere_revue: row.l_date_derniere_revue ?? null,
      date_prochaine_revue: row.l_date_prochaine_revue ?? null,
      periodicite_revue_mois: row.l_periodicite_revue_mois ?? null,
      statut_kyc: cleanText(row.l_statut_kyc),
      date_creation: row.l_date_creation ?? null,
      date_modification: row.l_date_modification ?? null,
      cree_par: cleanText(row.l_cree_par),
      modifie_par: cleanText(row.l_modifie_par),
      nb_evenements_ouverts: row.l_nb_evenements_ouverts ?? 0,
      nb_diligences_retard: row.l_nb_diligences_retard ?? 0,
    } : null;

    const [
      kyc,
      beneficiaires,
      pieces,
      evenements,
      diligences,
      revues,
      risqueHistorique,
      audit,
      revueEnCours,
    ] = await Promise.all([
      getKycDossierLab(pool, codeSafe),
      getBeneficiairesDossierLab(pool, codeSafe),
      getPiecesDossierLab(pool, codeSafe),
      getEvenementsDossierLab(pool, codeSafe),
      getDiligencesDossierLab(pool, codeSafe),
      getRevuesDossierLab(pool, codeSafe),
      getRisqueHistoriqueDossierLab(pool, codeSafe),
      getAuditDossierLab(pool, codeSafe),
      getRevueEnCours(pool, codeSafe),
    ]);

    return {
      client,
      lab,
      kyc,
      beneficiaires,
      pieces,
      evenements,
      diligences,
      revues,
      risqueHistorique,
      audit,
      revue_en_cours: revueEnCours,
    };
  } catch (err) {
    console.error('Erreur getDossierLab:', err);
    throw err;
  }
}
