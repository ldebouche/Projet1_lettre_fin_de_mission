/**
 * KYC et bénéficiaires effectifs.
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

const WIZARD_SUPPLEMENT_MARKER = '__WIZARD_JSON__';

function buildOriginePatrimoineForStorage(notesParts, wizardSupplement) {
  const supplement = wizardSupplement && typeof wizardSupplement === 'object'
    ? wizardSupplement
    : null;
  if (!supplement) {
    return notesParts.length ? notesParts.join(' | ') : null;
  }
  const payload = {
    wizard_supplement: supplement,
    legacy_text: notesParts.length ? notesParts.join(' | ') : null,
  };
  return `${WIZARD_SUPPLEMENT_MARKER}${JSON.stringify(payload)}`;
}

function parseOriginePatrimoine(raw) {
  const clean = cleanText(raw);
  if (!clean) {
    return { wizard_supplement: null, legacy_text: null };
  }
  if (clean.startsWith(WIZARD_SUPPLEMENT_MARKER)) {
    try {
      const parsed = JSON.parse(clean.slice(WIZARD_SUPPLEMENT_MARKER.length));
      return {
        wizard_supplement: parsed?.wizard_supplement ?? null,
        legacy_text: parsed?.legacy_text ?? null,
      };
    } catch {
      return { wizard_supplement: null, legacy_text: clean };
    }
  }
  return { wizard_supplement: null, legacy_text: clean };
}

function buildKycAuditDetail(kycInput = {}, options = {}) {
  const detail = { source: 'wizard' };
  const kycKeys = Object.keys(kycInput).filter((key) => {
    const value = kycInput[key];
    return value != null && value !== '';
  });
  if (kycKeys.length) {
    detail.kyc_champs = kycKeys;
  }

  const supplement = options.wizard_supplement && typeof options.wizard_supplement === 'object'
    ? options.wizard_supplement
    : null;
  if (!supplement) {
    return JSON.stringify(detail);
  }

  const supplementKeys = Object.keys(supplement).filter((key) => {
    const value = supplement[key];
    return value != null && value !== '';
  });
  if (supplementKeys.length) {
    detail.wizard_supplement_champs = supplementKeys;
  }

  const commentaireRevision = cleanText(supplement.commentaire_revision);
  if (commentaireRevision) {
    detail.commentaire_revision = commentaireRevision;
  }

  return JSON.stringify(detail);
}

function mapKycInputToDb(kycInput = {}, options = {}) {
  const kyc = kycInput && typeof kycInput === 'object' ? kycInput : {};
  const secteurs = Array.isArray(kyc.secteurs)
    ? kyc.secteurs
    : splitTextList(kyc.secteurs_text);
  const paysRisque = Array.isArray(kyc.pays_a_risque)
    ? kyc.pays_a_risque
    : splitTextList(kyc.pays_a_risque_text);

  const notesParts = [
    cleanText(kyc.notes),
    cleanText(kyc.justification_complexite)
      ? `Complexite: ${cleanText(kyc.justification_complexite)}`
      : null,
  ].filter(Boolean);

  let origineFonds = null;
  if (kyc.origine_fonds_statut === 'Renseignee') {
    origineFonds = notesParts[0] || 'Renseignee';
  }

  const opsIntl = options.operations_internationales === true
    || kyc.operations_internationales === true;

  return {
    secteur_activite: secteurs[0] || cleanText(options.secteur_activite) || null,
    zone_geographique_principale: cleanText(kyc.pays_implantation)
      || cleanText(options.zone_geographique_activite)
      || null,
    volume_affaires_estime: cleanText(kyc.volume_affaires_estime)
      || cleanText(options.volume_affaires_fourchette)
      || null,
    complexite_structure: normalizeComplexiteForStorage(kyc.complexite_structure),
    pays_risque: paysRisque.length ? paysRisque.join('; ') : null,
    operations_internationales: opsIntl ? 'O' : 'N',
    origine_fonds: origineFonds,
    origine_patrimoine: buildOriginePatrimoineForStorage(notesParts, options.wizard_supplement),
    est_pep: yesNoToDb(kyc.pep_statut),
    detail_pep: cleanText(kyc.pep_details),
    lien_pep: yesNoToDb(kyc.lien_pep) === 'O' ? 'O' : 'N',
    detail_lien_pep: cleanText(kyc.detail_lien_pep),
  };
}

/** D5.3-H : champs KYC dont la variation déclenche CHANGEMENT_KYC. */
const KYC_SIGNIFICANT_FIELDS = [
  'est_pep',
  'lien_pep',
  'operations_internationales',
  'pays_risque',
  'secteur_activite',
  'complexite_structure',
];

function normalizeKycComparableValue(field, value) {
  const v = cleanText(value);
  if (field === 'est_pep' || field === 'lien_pep' || field === 'operations_internationales') {
    return v ? v.toUpperCase().charAt(0) : 'N';
  }
  return (v || '').toLowerCase();
}

function detectKycSignificantChanges(previous, next) {
  const champs = [];
  for (const field of KYC_SIGNIFICANT_FIELDS) {
    const before = normalizeKycComparableValue(field, previous?.[field]);
    const after = normalizeKycComparableValue(field, next?.[field]);
    if (before !== after) champs.push(field);
  }
  return champs;
}

/**
 * UPSERT KYC pour un dossier LAB existant.
 */
export async function upsertKycLab(codeClient, payload, userId = null) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const kycInput = payload?.kyc && typeof payload.kyc === 'object' ? payload.kyc : {};
  const labInput = payload?.lab && typeof payload.lab === 'object' ? payload.lab : {};
  const options = payload?.options && typeof payload.options === 'object' ? payload.options : {};
  const mapped = mapKycInputToDb(kycInput, options);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let evenement = null;

  try {
    await assertClientExists(transaction, codeSafe);
    const dossierId = await assertDossierExists(transaction, codeSafe);

    const existing = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1
          id,
          RTRIM(LTRIM(secteur_activite)) AS secteur_activite,
          RTRIM(LTRIM(complexite_structure)) AS complexite_structure,
          RTRIM(LTRIM(pays_risque)) AS pays_risque,
          RTRIM(LTRIM(operations_internationales)) AS operations_internationales,
          RTRIM(LTRIM(est_pep)) AS est_pep,
          RTRIM(LTRIM(lien_pep)) AS lien_pep
        FROM lab_kyc
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);

    const existingRow = existing.recordset?.[0] ?? null;
    const kycId = existingRow?.id;

    if (kycId == null) {
      const insertRes = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('secteur_activite', sql.NChar(100), mapped.secteur_activite)
        .input('zone_geographique_principale', sql.NChar(60), mapped.zone_geographique_principale)
        .input('volume_affaires_estime', sql.NChar(30), mapped.volume_affaires_estime)
        .input('complexite_structure', sql.NChar(20), mapped.complexite_structure)
        .input('pays_risque', sql.NVarChar(500), mapped.pays_risque)
        .input('operations_internationales', sql.NChar(1), mapped.operations_internationales)
        .input('origine_fonds', sql.NVarChar(sql.MAX), mapped.origine_fonds)
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), mapped.origine_patrimoine)
        .input('est_pep', sql.NChar(1), mapped.est_pep)
        .input('detail_pep', sql.NVarChar(500), mapped.detail_pep)
        .input('lien_pep', sql.NChar(1), mapped.lien_pep)
        .input('detail_lien_pep', sql.NVarChar(500), mapped.detail_lien_pep)
        .input('modifie_par', sql.NChar(20), modifiePar)
        .query(`
          INSERT INTO lab_kyc (
            code_client,
            secteur_activite,
            zone_geographique_principale,
            volume_affaires_estime,
            complexite_structure,
            pays_risque,
            operations_internationales,
            origine_fonds,
            origine_patrimoine,
            est_pep,
            detail_pep,
            lien_pep,
            detail_lien_pep,
            modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @code_client,
            @secteur_activite,
            @zone_geographique_principale,
            @volume_affaires_estime,
            @complexite_structure,
            @pays_risque,
            @operations_internationales,
            @origine_fonds,
            @origine_patrimoine,
            @est_pep,
            @detail_pep,
            @lien_pep,
            @detail_lien_pep,
            @modifie_par
          )
        `);
      const insertedId = insertRes.recordset?.[0]?.id;
      await writeLabAuditLog(transaction, {
        userId: modifiePar,
        typeAction: 'CREATION_KYC',
        entite: 'lab_kyc',
        idEntite: insertedId,
        codeClient: codeSafe,
        detail: buildKycAuditDetail(kycInput, options),
      });
    } else {
      await new sql.Request(transaction)
        .input('id', sql.Int, kycId)
        .input('secteur_activite', sql.NChar(100), mapped.secteur_activite)
        .input('zone_geographique_principale', sql.NChar(60), mapped.zone_geographique_principale)
        .input('volume_affaires_estime', sql.NChar(30), mapped.volume_affaires_estime)
        .input('complexite_structure', sql.NChar(20), mapped.complexite_structure)
        .input('pays_risque', sql.NVarChar(500), mapped.pays_risque)
        .input('operations_internationales', sql.NChar(1), mapped.operations_internationales)
        .input('origine_fonds', sql.NVarChar(sql.MAX), mapped.origine_fonds)
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), mapped.origine_patrimoine)
        .input('est_pep', sql.NChar(1), mapped.est_pep)
        .input('detail_pep', sql.NVarChar(500), mapped.detail_pep)
        .input('lien_pep', sql.NChar(1), mapped.lien_pep)
        .input('detail_lien_pep', sql.NVarChar(500), mapped.detail_lien_pep)
        .input('modifie_par', sql.NChar(20), modifiePar)
        .query(`
          UPDATE lab_kyc
          SET
            secteur_activite = @secteur_activite,
            zone_geographique_principale = @zone_geographique_principale,
            volume_affaires_estime = @volume_affaires_estime,
            complexite_structure = @complexite_structure,
            pays_risque = @pays_risque,
            operations_internationales = @operations_internationales,
            origine_fonds = @origine_fonds,
            origine_patrimoine = @origine_patrimoine,
            est_pep = @est_pep,
            detail_pep = @detail_pep,
            lien_pep = @lien_pep,
            detail_lien_pep = @detail_lien_pep,
            date_modification = SYSUTCDATETIME(),
            modifie_par = @modifie_par
          WHERE id = @id
        `);
      await writeLabAuditLog(transaction, {
        userId: modifiePar,
        typeAction: 'MODIF_KYC',
        entite: 'lab_kyc',
        idEntite: kycId,
        codeClient: codeSafe,
        detail: buildKycAuditDetail(kycInput, options),
      });

      const skipKycEvent = options.creer_evenement_changement_kyc === false;
      if (!skipKycEvent) {
        const champs = detectKycSignificantChanges(existingRow, mapped);
        if (champs.length > 0) {
          evenement = await ensureEvenementAutoLab(transaction, {
            codeClient: codeSafe,
            typeEvenement: 'CHANGEMENT_KYC',
            criticite: 'Moyenne',
            userId: modifiePar,
            source: 'auto_kyc',
            extraDetail: { champs },
          });
        }
      }
    }

    if (labInput.statut_kyc != null) {
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('statut_kyc', sql.NChar(20), cleanText(labInput.statut_kyc) || 'Incomplet')
        .input('modifie_par', sql.NChar(20), modifiePar)
        .query(`
          UPDATE lab_dossier
          SET
            statut_kyc = @statut_kyc,
            date_modification = SYSUTCDATETIME(),
            modifie_par = @modifie_par
          WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        `);
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const kyc = await getKycDossierLab(pool, codeSafe);
  const { getDossierLab } = await import('./lab-dossier-service.js');
  const dossier = await getDossierLab(codeSafe);
  return {
    kyc,
    lab: dossier?.lab ? { statut_kyc: dossier.lab.statut_kyc } : null,
    evenement,
  };
}

/**
 * Ajoute un bénéficiaire effectif (+ événement CHANGEMENT_BE par défaut).
 */
export async function createBeneficiaireLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const nom = cleanText(payload.nom);
  if (!nom) {
    throw new LabDossierError('nom requis', 400);
  }
  assertBeneficiaireFieldLengths({
    nom,
    prenom: payload.prenom,
    nationalite: payload.nationalite,
    pays_residence: payload.pays_residence,
    commentaire: payload.commentaire,
  });

  const pourcentage = toNumberOrNull(payload.pourcentage);
  const modeControle = normalizeModeControle(payload.mode_controle);
  const detention = modeControle === 'Detention_capital' ? pourcentage : null;
  const controleTotal = pourcentage;
  const estPep = yesNoToDb(payload.pep_statut);
  const sanctions = yesNoUnknown(payload.sanctions_gel) === 'Oui';
  const creerEvenement = payload.options?.creer_evenement_changement_be !== false;
  const creePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const insertBe = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('nom', sql.NChar(50), nom)
      .input('prenom', sql.NChar(30), cleanText(payload.prenom))
      .input('nationalite', sql.NChar(40), cleanText(payload.nationalite))
      .input('pays_residence', sql.NChar(40), cleanText(payload.pays_residence))
      .input('pourcentage_detention', sql.Decimal(5, 2), detention)
      .input('pourcentage_controle_total', sql.Decimal(5, 2), controleTotal)
      .input('type_controle', sql.NChar(30), modeControle)
      .input('est_pep', sql.NChar(1), estPep)
      .input('sous_sanctions', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('gel_avoirs', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('detail_statut', sql.NVarChar(500), cleanText(payload.commentaire))
      .input('date_debut', sql.Date, todayUtcDate())
      .input('cree_par', sql.NChar(20), creePar)
      .input('modifie_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_beneficiaires_effectifs (
          code_client,
          nom,
          prenom,
          nationalite,
          pays_residence,
          pourcentage_detention,
          pourcentage_controle_total,
          type_controle,
          est_pep,
          sous_sanctions,
          gel_avoirs,
          detail_statut,
          actif,
          date_debut,
          version,
          cree_par,
          modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client,
          @nom,
          @prenom,
          @nationalite,
          @pays_residence,
          @pourcentage_detention,
          @pourcentage_controle_total,
          @type_controle,
          @est_pep,
          @sous_sanctions,
          @gel_avoirs,
          @detail_statut,
          N'O',
          @date_debut,
          1,
          @cree_par,
          @modifie_par
        )
      `);

    const beId = insertBe.recordset?.[0]?.id;
    if (beId == null) {
      throw new Error('INSERT lab_beneficiaires_effectifs sans id retourné');
    }

    let evenement = null;
    if (creerEvenement) {
      const eventRes = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'CHANGEMENT_BE')
        .input('libelle', sql.NChar(200), 'Nouveau bénéficiaire effectif')
        .input('criticite', sql.NChar(10), 'Moyenne')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, todayUtcDate())
        .input('id_responsable', sql.NChar(20), creePar)
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
          OUTPUT INSERTED.id
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
      const eventId = eventRes.recordset?.[0]?.id;
      evenement = eventId != null ? { id: eventId, type: 'CHANGEMENT_BE' } : null;
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_BE',
      entite: 'lab_beneficiaires_effectifs',
      idEntite: beId,
      codeClient: codeSafe,
      detail: JSON.stringify({ nom, source: 'wizard' }),
    });

    await transaction.commit();

    const beneficiaires = await getBeneficiairesDossierLab(pool, codeSafe);
    const beneficiaire = beneficiaires.find((b) => b.id === String(beId)) ?? {
      id: String(beId),
      nom,
      prenom: cleanText(payload.prenom),
      type: 'Personne_physique',
      nationalite: cleanText(payload.nationalite),
      pays_residence: cleanText(payload.pays_residence),
      pourcentage: controleTotal,
      mode_controle: modeControle,
      pep_statut: yesNoUnknown(estPep === 'O' ? 'Oui' : 'Non'),
      sanctions_gel: sanctions ? 'Oui' : 'Non',
      commentaire: cleanText(payload.commentaire),
    };

    return { beneficiaire, evenement };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function insertChangementBeEvent(transaction, codeSafe, userId, libelle) {
  const creePar = cleanText(userId);
  const eventRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeSafe)
    .input('type_evenement', sql.NChar(50), 'CHANGEMENT_BE')
    .input('libelle', sql.NChar(200), cleanText(libelle) || 'Modification bénéficiaire effectif')
    .input('criticite', sql.NChar(10), 'Moyenne')
    .input('statut', sql.NChar(20), 'Ouvert')
    .input('date_evenement', sql.Date, todayUtcDate())
    .input('id_responsable', sql.NChar(20), creePar)
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
      OUTPUT INSERTED.id
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
  const eventId = eventRes.recordset?.[0]?.id;
  return eventId != null ? { id: eventId, type: 'CHANGEMENT_BE' } : null;
}

/**
 * Résout le code_client d'un BE (contrôle RBAC avant PUT/DELETE).
 */
export async function resolveBeneficiaireCodeClient(beId) {
  const id = parseEntityId(beId);
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_beneficiaires_effectifs
      WHERE id = @id AND RTRIM(LTRIM(actif)) = N'O'
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Bénéficiaire effectif introuvable', 404);
  }
  return code;
}

/**
 * Met à jour un bénéficiaire effectif existant (+ événement CHANGEMENT_BE par défaut).
 */
export async function updateBeneficiaireLab(beId, payload, userId = null) {
  const id = parseEntityId(beId);
  const nom = cleanText(payload?.nom);
  if (!nom) {
    throw new LabDossierError('nom requis', 400);
  }
  assertBeneficiaireFieldLengths({
    nom,
    prenom: payload?.prenom,
    nationalite: payload?.nationalite,
    pays_residence: payload?.pays_residence,
    commentaire: payload?.commentaire,
  });

  const pourcentage = toNumberOrNull(payload?.pourcentage);
  const modeControle = normalizeModeControle(payload?.mode_controle);
  const detention = modeControle === 'Detention_capital' ? pourcentage : null;
  const controleTotal = pourcentage;
  const estPep = yesNoToDb(payload?.pep_statut);
  const sanctions = yesNoUnknown(payload?.sanctions_gel) === 'Oui';
  const creerEvenement = payload?.options?.creer_evenement_changement_be !== false;
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client, version
        FROM lab_beneficiaires_effectifs
        WHERE id = @id AND RTRIM(LTRIM(actif)) = N'O'
      `);
    const row = existing.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Bénéficiaire effectif introuvable', 404);
    }
    const codeSafe = cleanText(row.code_client);
    await assertDossierExists(transaction, codeSafe);

    const nextVersion = (row.version ?? 1) + 1;

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('nom', sql.NChar(50), nom)
      .input('prenom', sql.NChar(30), cleanText(payload?.prenom))
      .input('nationalite', sql.NChar(40), cleanText(payload?.nationalite))
      .input('pays_residence', sql.NChar(40), cleanText(payload?.pays_residence))
      .input('pourcentage_detention', sql.Decimal(5, 2), detention)
      .input('pourcentage_controle_total', sql.Decimal(5, 2), controleTotal)
      .input('type_controle', sql.NChar(30), modeControle)
      .input('est_pep', sql.NChar(1), estPep)
      .input('sous_sanctions', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('gel_avoirs', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('detail_statut', sql.NVarChar(500), cleanText(payload?.commentaire))
      .input('version', sql.Int, nextVersion)
      .input('modifie_par', sql.NChar(20), modifiePar)
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET
          nom = @nom,
          prenom = @prenom,
          nationalite = @nationalite,
          pays_residence = @pays_residence,
          pourcentage_detention = @pourcentage_detention,
          pourcentage_controle_total = @pourcentage_controle_total,
          type_controle = @type_controle,
          est_pep = @est_pep,
          sous_sanctions = @sous_sanctions,
          gel_avoirs = @gel_avoirs,
          detail_statut = @detail_statut,
          version = @version,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE id = @id
      `);

    let evenement = null;
    if (creerEvenement) {
      evenement = await insertChangementBeEvent(
        transaction,
        codeSafe,
        modifiePar,
        'Modification bénéficiaire effectif',
      );
    }

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_BE',
      entite: 'lab_beneficiaires_effectifs',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ nom, source: 'wizard', version: nextVersion }),
    });

    await transaction.commit();

    const beneficiaires = await getBeneficiairesDossierLab(pool, codeSafe);
    const beneficiaire = beneficiaires.find((b) => b.id === String(id)) ?? {
      id: String(id),
      nom,
      prenom: cleanText(payload?.prenom),
      type: 'Personne_physique',
      nationalite: cleanText(payload?.nationalite),
      pays_residence: cleanText(payload?.pays_residence),
      pourcentage: controleTotal,
      mode_controle: modeControle,
      pep_statut: yesNoUnknown(estPep === 'O' ? 'Oui' : 'Non'),
      sanctions_gel: sanctions ? 'Oui' : 'Non',
      commentaire: cleanText(payload?.commentaire),
    };

    return { beneficiaire, evenement };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Désactive un bénéficiaire effectif (actif = N, date_fin = aujourd'hui).
 */
export async function deleteBeneficiaireLab(beId, userId = null) {
  const id = parseEntityId(beId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client, nom, version
        FROM lab_beneficiaires_effectifs
        WHERE id = @id AND RTRIM(LTRIM(actif)) = N'O'
      `);
    const row = existing.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Bénéficiaire effectif introuvable', 404);
    }
    const codeSafe = cleanText(row.code_client);
    const nom = cleanText(row.nom);
    const nextVersion = (row.version ?? 1) + 1;

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('version', sql.Int, nextVersion)
      .input('modifie_par', sql.NChar(20), modifiePar)
      .input('date_fin', sql.Date, todayUtcDate())
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET
          actif = N'N',
          date_fin = @date_fin,
          version = @version,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE id = @id
      `);

    await insertChangementBeEvent(
      transaction,
      codeSafe,
      modifiePar,
      'Suppression bénéficiaire effectif',
    );

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'SUPPRESSION_BE',
      entite: 'lab_beneficiaires_effectifs',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ nom, source: 'wizard' }),
    });

    await transaction.commit();
    return { id: String(id), code_client: codeSafe };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getKycDossierLab(pool, codeClient) {
  const query = `
    SELECT TOP 1
      secteur_activite,
      zone_geographique_principale,
      volume_affaires_estime,
      complexite_structure,
      pays_risque,
      operations_internationales,
      origine_fonds,
      origine_patrimoine,
      est_pep,
      detail_pep,
      lien_pep,
      detail_lien_pep
    FROM lab_kyc
    WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY date_modification DESC, id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  const row = result.recordset?.[0];
  if (!row) {
    return null;
  }

  const origineFonds = cleanText(row.origine_fonds);
  const originePatrimoineRaw = cleanText(row.origine_patrimoine);
  const { wizard_supplement: wizardSupplement, legacy_text: legacyPatrimoine } = parseOriginePatrimoine(
    originePatrimoineRaw,
  );
  const volumeAffaires = cleanText(row.volume_affaires_estime);
  const operationsInternationales = yesNoUnknown(row.operations_internationales);
  const secteur = cleanText(row.secteur_activite);
  const estPep = yesNoUnknown(row.est_pep);
  const lienPep = yesNoUnknown(row.lien_pep);
  const pepDetails = [
    cleanText(row.detail_pep),
    cleanText(row.detail_lien_pep) ? `Lien PEP: ${cleanText(row.detail_lien_pep)}` : null,
  ].filter(Boolean).join(' | ');
  const notes = [
    volumeAffaires ? `Volume d'affaires estime: ${volumeAffaires}` : null,
    operationsInternationales !== 'Inconnu'
      ? `Operations internationales: ${operationsInternationales}`
      : null,
    legacyPatrimoine ? `Origine patrimoine: ${legacyPatrimoine}` : null,
  ].filter(Boolean).join(' | ');

  const supplementCategorie = cleanText(wizardSupplement?.categorie_client);
  const categorieClient = supplementCategorie === 'Personne_physique'
    ? 'Personne_physique'
    : supplementCategorie === 'Personne_morale'
      ? 'Personne_morale'
      : 'Personne_morale';

  return {
    categorie_client: categorieClient,
    pays_residence_fiscale: cleanText(wizardSupplement?.pays_residence_fiscale) || null,
    pays_implantation: cleanText(row.zone_geographique_principale),
    pays_a_risque: splitTextList(row.pays_risque),
    secteur_sensible: wizardSupplement?.secteur_sensible === true,
    secteurs: secteur ? [secteur] : [],
    pep_statut: estPep === 'Oui' || lienPep === 'Oui'
      ? 'Oui'
      : estPep === 'Inconnu' || lienPep === 'Inconnu'
        ? 'Inconnu'
        : 'Non',
    pep_details: pepDetails || null,
    origine_fonds_requise: true,
    origine_fonds_statut: origineFonds ? 'Renseignee' : 'A_renseigner',
    complexite_structure: normalizeComplexite(row.complexite_structure),
    justification_complexite: null,
    exposition_sanctions: 'Inconnu',
    notes: notes || null,
    wizard_supplement: wizardSupplement ?? null,
  };
}

export async function getBeneficiairesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      id,
      nom,
      prenom,
      nationalite,
      pays_residence,
      pourcentage_detention,
      pourcentage_controle_total,
      type_controle,
      est_pep,
      sous_sanctions,
      gel_avoirs,
      detail_statut
    FROM lab_beneficiaires_effectifs
    WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      AND RTRIM(LTRIM(actif)) = 'O'
    ORDER BY
      ISNULL(pourcentage_controle_total, pourcentage_detention) DESC,
      nom ASC,
      prenom ASC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => ({
    id: String(row.id),
    nom: cleanText(row.nom) || 'Bénéficiaire sans nom',
    prenom: cleanText(row.prenom),
    type: 'Personne_physique',
    nationalite: cleanText(row.nationalite),
    pays_residence: cleanText(row.pays_residence),
    pourcentage: toNumberOrNull(row.pourcentage_controle_total ?? row.pourcentage_detention),
    mode_controle: normalizeModeControle(row.type_controle),
    pep_statut: yesNoUnknown(row.est_pep),
    sanctions_gel: yesNoUnknown(row.sous_sanctions) === 'Oui' || yesNoUnknown(row.gel_avoirs) === 'Oui'
      ? 'Oui'
      : yesNoUnknown(row.sous_sanctions) === 'Inconnu' || yesNoUnknown(row.gel_avoirs) === 'Inconnu'
        ? 'Inconnu'
        : 'Non',
    commentaire: cleanText(row.detail_statut),
  }));
}
