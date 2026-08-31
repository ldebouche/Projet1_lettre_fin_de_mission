/**
 * Snapshots dossier pour clôture / annulation de revue (SQL inline, pas d’import pieces).
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

export async function captureDossierSnapshot(transaction, codeClient) {
  const clientRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        siret, raison_sociale, forme_societe, rcs, ape, activite, nature, tvaintracom,
        montant_capital_social, date_entree_cabinet, adr1_siege, adr2_siege, cpos_siege,
        ville_siege, tel_fixe, tel_portable, email, regime_fiscal, soumis_is, mois_cloture,
        logiciel_compta, expert_comptable, chef_de_mission
      FROM clients
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const dossierRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        id, statut_dossier, niveau_risque, vigilance, id_responsable_lab,
        date_entree_relation, date_derniere_revue, date_prochaine_revue,
        periodicite_revue_mois, statut_kyc
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const kycRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 *
      FROM lab_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const beRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT *
      FROM lab_beneficiaires_effectifs
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(actif)) = N'O'
    `);

  const piecesRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT *
      FROM lab_pieces_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const evalRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 *
      FROM lab_arpec_evaluations
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(est_active)) = N'O'
      ORDER BY date_evaluation DESC, id DESC
    `);

  const maxEvalRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT MAX(id) AS max_eval_id
      FROM lab_arpec_evaluations
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const activeEval = evalRes.recordset?.[0] ?? null;
  let arpecReponses = [];
  let arpecAxes = [];
  if (activeEval?.id != null) {
    const repRes = await new sql.Request(transaction)
      .input('id_evaluation', sql.Int, activeEval.id)
      .query(`
        SELECT id_evaluation, id_question, reponse, commentaire
        FROM lab_arpec_reponses
        WHERE id_evaluation = @id_evaluation
      `);
    arpecReponses = repRes.recordset || [];

    const axesRes = await new sql.Request(transaction)
      .input('id_evaluation', sql.Int, activeEval.id)
      .query(`
        SELECT id_evaluation, id_axe, nb_oui, niveau_axe
        FROM lab_arpec_evaluation_axes
        WHERE id_evaluation = @id_evaluation
      `);
    arpecAxes = axesRes.recordset || [];
  }

  return {
    captured_at: new Date().toISOString(),
    client: clientRes.recordset?.[0] ?? null,
    dossier: dossierRes.recordset?.[0] ?? null,
    kyc: kycRes.recordset?.[0] ?? null,
    beneficiaires: beRes.recordset || [],
    pieces: piecesRes.recordset || [],
    arpec: {
      evaluation: activeEval,
      reponses: arpecReponses,
      axes: arpecAxes,
      max_eval_id: maxEvalRes.recordset?.[0]?.max_eval_id ?? null,
    },
  };
}

export async function restoreDossierSnapshot(transaction, codeClient, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new LabDossierError('Snapshot de revue invalide', 500);
  }

  const client = snapshot.client;
  if (client) {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('siret', sql.NChar(17), cleanText(client.siret))
      .input('raison_sociale', sql.NChar(100), cleanText(client.raison_sociale))
      .input('forme_societe', sql.NChar(30), cleanText(client.forme_societe))
      .input('rcs', sql.NChar(50), cleanText(client.rcs))
      .input('ape', sql.NChar(10), cleanText(client.ape))
      .input('activite', sql.NChar(100), cleanText(client.activite))
      .input('nature', sql.NChar(50), cleanText(client.nature))
      .input('tvaintracom', sql.NChar(20), cleanText(client.tvaintracom))
      .input('montant_capital_social', sql.Decimal(18, 2), client.montant_capital_social ?? null)
      .input('date_entree_cabinet', sql.Date, client.date_entree_cabinet ?? null)
      .input('adr1_siege', sql.NChar(50), cleanText(client.adr1_siege))
      .input('adr2_siege', sql.NChar(50), cleanText(client.adr2_siege))
      .input('cpos_siege', sql.NChar(10), cleanText(client.cpos_siege))
      .input('ville_siege', sql.NChar(50), cleanText(client.ville_siege))
      .input('tel_fixe', sql.NChar(20), cleanText(client.tel_fixe))
      .input('tel_portable', sql.NChar(20), cleanText(client.tel_portable))
      .input('email', sql.NChar(100), cleanText(client.email))
      .input('regime_fiscal', sql.NChar(30), cleanText(client.regime_fiscal))
      .input('soumis_is', sql.NChar(1), cleanText(client.soumis_is) || 'N')
      .input('mois_cloture', sql.Int, client.mois_cloture ?? null)
      .input('logiciel_compta', sql.NChar(50), cleanText(client.logiciel_compta))
      .input('expert_comptable', sql.NChar(20), cleanText(client.expert_comptable))
      .input('chef_de_mission', sql.NChar(20), cleanText(client.chef_de_mission))
      .query(`
        UPDATE clients
        SET
          siret = @siret,
          raison_sociale = @raison_sociale,
          forme_societe = @forme_societe,
          rcs = @rcs,
          ape = @ape,
          activite = @activite,
          nature = @nature,
          tvaintracom = @tvaintracom,
          montant_capital_social = @montant_capital_social,
          date_entree_cabinet = @date_entree_cabinet,
          adr1_siege = @adr1_siege,
          adr2_siege = @adr2_siege,
          cpos_siege = @cpos_siege,
          ville_siege = @ville_siege,
          tel_fixe = @tel_fixe,
          tel_portable = @tel_portable,
          email = @email,
          regime_fiscal = @regime_fiscal,
          soumis_is = @soumis_is,
          mois_cloture = @mois_cloture,
          logiciel_compta = @logiciel_compta,
          expert_comptable = @expert_comptable,
          chef_de_mission = @chef_de_mission
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
  }

  const dossier = snapshot.dossier;
  if (dossier) {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('statut_dossier', sql.NChar(20), cleanText(dossier.statut_dossier) || 'Actif')
      .input('niveau_risque', sql.NChar(10), cleanText(dossier.niveau_risque) || 'Faible')
      .input('vigilance', sql.NChar(10), cleanText(dossier.vigilance) || 'Standard')
      .input('id_responsable_lab', sql.NChar(20), cleanText(dossier.id_responsable_lab))
      .input('date_entree_relation', sql.Date, dossier.date_entree_relation ?? null)
      .input('date_derniere_revue', sql.Date, dossier.date_derniere_revue ?? null)
      .input('date_prochaine_revue', sql.Date, dossier.date_prochaine_revue ?? null)
      .input('periodicite_revue_mois', sql.Int, dossier.periodicite_revue_mois ?? 12)
      .input('statut_kyc', sql.NChar(20), cleanText(dossier.statut_kyc) || 'Incomplet')
      .query(`
        UPDATE lab_dossier
        SET
          statut_dossier = @statut_dossier,
          niveau_risque = @niveau_risque,
          vigilance = @vigilance,
          id_responsable_lab = @id_responsable_lab,
          date_entree_relation = @date_entree_relation,
          date_derniere_revue = @date_derniere_revue,
          date_prochaine_revue = @date_prochaine_revue,
          periodicite_revue_mois = @periodicite_revue_mois,
          statut_kyc = @statut_kyc,
          date_modification = SYSUTCDATETIME()
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
  }

  const kyc = snapshot.kyc;
  const existingKyc = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id FROM lab_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const existingKycId = existingKyc.recordset?.[0]?.id;

  if (kyc) {
    if (existingKycId != null) {
      await new sql.Request(transaction)
        .input('id', sql.Int, existingKycId)
        .input('secteur_activite', sql.NChar(100), cleanText(kyc.secteur_activite))
        .input('zone_geographique_principale', sql.NChar(60), cleanText(kyc.zone_geographique_principale))
        .input('volume_affaires_estime', sql.NChar(30), cleanText(kyc.volume_affaires_estime))
        .input('complexite_structure', sql.NChar(20), cleanText(kyc.complexite_structure))
        .input('pays_risque', sql.NVarChar(500), cleanText(kyc.pays_risque))
        .input('operations_internationales', sql.NChar(1), cleanText(kyc.operations_internationales) || 'N')
        .input('origine_fonds', sql.NVarChar(sql.MAX), cleanText(kyc.origine_fonds))
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), cleanText(kyc.origine_patrimoine))
        .input('est_pep', sql.NChar(1), cleanText(kyc.est_pep) || 'N')
        .input('detail_pep', sql.NVarChar(500), cleanText(kyc.detail_pep))
        .input('lien_pep', sql.NChar(1), cleanText(kyc.lien_pep) || 'N')
        .input('detail_lien_pep', sql.NVarChar(500), cleanText(kyc.detail_lien_pep))
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
            date_modification = SYSUTCDATETIME()
          WHERE id = @id
        `);
    } else {
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeClient)
        .input('secteur_activite', sql.NChar(100), cleanText(kyc.secteur_activite))
        .input('zone_geographique_principale', sql.NChar(60), cleanText(kyc.zone_geographique_principale))
        .input('volume_affaires_estime', sql.NChar(30), cleanText(kyc.volume_affaires_estime))
        .input('complexite_structure', sql.NChar(20), cleanText(kyc.complexite_structure))
        .input('pays_risque', sql.NVarChar(500), cleanText(kyc.pays_risque))
        .input('operations_internationales', sql.NChar(1), cleanText(kyc.operations_internationales) || 'N')
        .input('origine_fonds', sql.NVarChar(sql.MAX), cleanText(kyc.origine_fonds))
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), cleanText(kyc.origine_patrimoine))
        .input('est_pep', sql.NChar(1), cleanText(kyc.est_pep) || 'N')
        .input('detail_pep', sql.NVarChar(500), cleanText(kyc.detail_pep))
        .input('lien_pep', sql.NChar(1), cleanText(kyc.lien_pep) || 'N')
        .input('detail_lien_pep', sql.NVarChar(500), cleanText(kyc.detail_lien_pep))
        .query(`
          INSERT INTO lab_kyc (
            code_client, secteur_activite, zone_geographique_principale,
            volume_affaires_estime, complexite_structure, pays_risque,
            operations_internationales, origine_fonds, origine_patrimoine,
            est_pep, detail_pep, lien_pep, detail_lien_pep
          )
          VALUES (
            @code_client, @secteur_activite, @zone_geographique_principale,
            @volume_affaires_estime, @complexite_structure, @pays_risque,
            @operations_internationales, @origine_fonds, @origine_patrimoine,
            @est_pep, @detail_pep, @lien_pep, @detail_lien_pep
          )
        `);
    }
  } else if (existingKycId != null) {
    await new sql.Request(transaction)
      .input('id', sql.Int, existingKycId)
      .query(`DELETE FROM lab_kyc WHERE id = @id`);
  }

  const snapshotBe = Array.isArray(snapshot.beneficiaires) ? snapshot.beneficiaires : [];
  const snapshotBeIds = snapshotBe.map((b) => b.id).filter((id) => id != null);

  if (snapshotBeIds.length > 0) {
    const idList = snapshotBeIds.join(',');
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('date_fin', sql.Date, todayUtcDate())
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET actif = N'N', date_fin = @date_fin, date_modification = SYSUTCDATETIME()
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(actif)) = N'O'
          AND id NOT IN (${idList})
      `);
  } else {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('date_fin', sql.Date, todayUtcDate())
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET actif = N'N', date_fin = @date_fin, date_modification = SYSUTCDATETIME()
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(actif)) = N'O'
      `);
  }

  for (const be of snapshotBe) {
    if (be.id == null) continue;
    await new sql.Request(transaction)
      .input('id', sql.Int, be.id)
      .input('nom', sql.NChar(50), cleanText(be.nom))
      .input('prenom', sql.NChar(30), cleanText(be.prenom))
      .input('nationalite', sql.NChar(40), cleanText(be.nationalite))
      .input('pays_residence', sql.NChar(40), cleanText(be.pays_residence))
      .input('pourcentage_detention', sql.Decimal(5, 2), be.pourcentage_detention ?? null)
      .input('pourcentage_controle_total', sql.Decimal(5, 2), be.pourcentage_controle_total ?? null)
      .input('type_controle', sql.NChar(30), cleanText(be.type_controle))
      .input('est_pep', sql.NChar(1), cleanText(be.est_pep) || 'N')
      .input('sous_sanctions', sql.NChar(1), cleanText(be.sous_sanctions) || 'N')
      .input('gel_avoirs', sql.NChar(1), cleanText(be.gel_avoirs) || 'N')
      .input('detail_statut', sql.NVarChar(500), cleanText(be.detail_statut))
      .input('actif', sql.NChar(1), 'O')
      .input('date_debut', sql.Date, be.date_debut ?? null)
      .input('date_fin', sql.Date, null)
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
          actif = @actif,
          date_debut = @date_debut,
          date_fin = @date_fin,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);
  }

  const snapshotPieces = Array.isArray(snapshot.pieces) ? snapshot.pieces : [];
  const snapshotPieceIds = snapshotPieces.map((p) => p.id).filter((id) => id != null);

  if (snapshotPieceIds.length > 0) {
    const pieceIdList = snapshotPieceIds.join(',');
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .query(`
        DELETE FROM lab_pieces_kyc
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND id NOT IN (${pieceIdList})
      `);
  } else {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .query(`
        DELETE FROM lab_pieces_kyc
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
  }

  for (const piece of snapshotPieces) {
    if (piece.id == null) continue;
    await new sql.Request(transaction)
      .input('id', sql.Int, piece.id)
      .input('type_piece', sql.NChar(50), cleanText(piece.type_piece) || 'Pièce KYC')
      .input('libelle', sql.NChar(200), cleanText(piece.libelle))
      .input('statut', sql.NChar(20), cleanText(piece.statut) || 'Attendue')
      .input('date_delivrance', sql.Date, piece.date_delivrance ?? null)
      .input('date_echeance', sql.Date, piece.date_echeance ?? null)
      .input('filepath', sql.NVarChar(500), cleanText(piece.filepath))
      .input('nom_fichier', sql.NVarChar(200), cleanText(piece.nom_fichier))
      .query(`
        UPDATE lab_pieces_kyc
        SET
          type_piece = @type_piece,
          libelle = @libelle,
          statut = @statut,
          date_delivrance = @date_delivrance,
          date_echeance = @date_echeance,
          filepath = @filepath,
          nom_fichier = @nom_fichier,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);
  }

  const maxEvalId = snapshot.arpec?.max_eval_id ?? null;
  if (maxEvalId != null) {
    const newEvals = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('max_eval_id', sql.Int, maxEvalId)
      .query(`
        SELECT id FROM lab_arpec_evaluations
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND id > @max_eval_id
      `);
    for (const row of newEvals.recordset || []) {
      await new sql.Request(transaction)
        .input('id_evaluation', sql.Int, row.id)
        .query(`DELETE FROM lab_arpec_reponses WHERE id_evaluation = @id_evaluation`);
      await new sql.Request(transaction)
        .input('id_evaluation', sql.Int, row.id)
        .query(`DELETE FROM lab_arpec_evaluation_axes WHERE id_evaluation = @id_evaluation`);
      await new sql.Request(transaction)
        .input('id', sql.Int, row.id)
        .query(`DELETE FROM lab_arpec_evaluations WHERE id = @id`);
    }
  }

  await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      UPDATE lab_arpec_evaluations
      SET est_active = N'N'
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(est_active)) = N'O'
    `);

  const snapshotEval = snapshot.arpec?.evaluation;
  if (snapshotEval?.id != null) {
    await new sql.Request(transaction)
      .input('id', sql.Int, snapshotEval.id)
      .input('niveau_calcule', sql.NChar(10), cleanText(snapshotEval.niveau_calcule))
      .input('niveau_retenu', sql.NChar(10), cleanText(snapshotEval.niveau_retenu))
      .input('modulation', sql.NChar(10), cleanText(snapshotEval.modulation) || 'Conforme')
      .input('justification_modulation', sql.NVarChar(500), cleanText(snapshotEval.justification_modulation))
      .input('vigilance', sql.NChar(10), cleanText(snapshotEval.vigilance) || 'Standard')
      .input('commentaire', sql.NVarChar(sql.MAX), cleanText(snapshotEval.commentaire))
      .query(`
        UPDATE lab_arpec_evaluations
        SET
          niveau_calcule = @niveau_calcule,
          niveau_retenu = @niveau_retenu,
          modulation = @modulation,
          justification_modulation = @justification_modulation,
          vigilance = @vigilance,
          commentaire = @commentaire,
          est_active = N'O'
        WHERE id = @id
      `);
  }
}

