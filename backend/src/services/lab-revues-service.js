/**
 * Revues périodiques : CRUD, clôture, job REVUE_ANNUELLE, loader GET dossier.
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
import { captureDossierSnapshot, restoreDossierSnapshot } from './lab-revue-snapshot.js';

/**
 * Job 5.3c — dossiers dont date_prochaine_revue est dépassée.
 * Crée un événement REVUE_ANNUELLE ouvert (D5.3-K : pas de session lab_revues).
 * Idempotent (D5.3-I) : un événement ouvert du type par dossier.
 * Skip si revue En_cours ou dossier clôturé. Pas de notification.
 *
 * @param {string|null} [userId='JOB_LAB']
 * @returns {Promise<{ scanned: number, created: number, skipped: number, skipped_revue_en_cours: number, skipped_deja_ouvert: number, ids: number[] }>}
 */
export async function scanRevueAnnuelleLab(userId = 'JOB_LAB') {
  const actor = cleanText(userId) || 'JOB_LAB';
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const candidates = await new sql.Request(transaction).query(`
      SELECT
        RTRIM(LTRIM(d.code_client)) AS code_client,
        d.date_prochaine_revue
      FROM lab_dossier d
      WHERE d.date_prochaine_revue IS NOT NULL
        AND d.date_prochaine_revue < CAST(GETDATE() AS DATE)
        AND RTRIM(LTRIM(ISNULL(d.statut_dossier, N''))) NOT IN (N'Cloture', N'Clôturé', N'Cloturee')
      ORDER BY d.date_prochaine_revue ASC, d.code_client ASC
    `);

    const rows = candidates.recordset || [];
    const scanned = rows.length;
    const ids = [];
    let created = 0;
    let skipped = 0;
    let skippedRevueEnCours = 0;
    let skippedDejaOuvert = 0;

    for (const row of rows) {
      const codeClient = cleanText(row.code_client);
      if (!codeClient) {
        skipped += 1;
        continue;
      }

      const enCours = await getRevueEnCours(transaction, codeClient);
      if (enCours) {
        skipped += 1;
        skippedRevueEnCours += 1;
        continue;
      }

      const evenement = await ensureEvenementAutoLab(transaction, {
        codeClient,
        typeEvenement: 'REVUE_ANNUELLE',
        criticite: 'Moyenne',
        libelle: 'Revue périodique',
        userId: actor,
        source: 'job_revue_annuelle',
        extraDetail: {
          date_prochaine_revue: row.date_prochaine_revue,
        },
      });

      if (!evenement) {
        skipped += 1;
        continue;
      }
      if (evenement.created) {
        created += 1;
        ids.push(evenement.id);
      } else {
        skipped += 1;
        skippedDejaOuvert += 1;
      }
    }

    await transaction.commit();

    return {
      scanned,
      created,
      skipped,
      skipped_revue_en_cours: skippedRevueEnCours,
      skipped_deja_ouvert: skippedDejaOuvert,
      ids,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getRevuesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      r.id,
      r.type_revue,
      r.date_revue,
      r.id_responsable,
      r.statut,
      r.conclusion_risque,
      r.commentaires_conclusion,
      r.niveau_risque_avant,
      r.niveau_risque_apres,
      responsable.nom AS responsable_nom,
      responsable.prenom AS responsable_prenom
    FROM lab_revues r
    LEFT JOIN collaborateurs responsable
      ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(r.id_responsable))
    WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      AND RTRIM(LTRIM(r.statut)) <> N'Annulee'
    ORDER BY r.date_revue DESC, r.id DESC
  `;

  const reponsesQuery = `
    SELECT
      rr.id_revue,
      rr.code_question,
      rr.libelle_question,
      rr.reponse,
      rr.commentaire
    FROM lab_revues_reponses rr
    INNER JOIN lab_revues r ON r.id = rr.id_revue
    WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      AND RTRIM(LTRIM(r.statut)) <> N'Annulee'
    ORDER BY rr.id_revue DESC, rr.id ASC
  `;

  const [result, reponsesRes] = await Promise.all([
    pool.request().input('code_client', sql.NVarChar(10), codeClient).query(query),
    pool.request().input('code_client', sql.NVarChar(10), codeClient).query(reponsesQuery),
  ]);

  const reponsesByRevue = new Map();
  for (const row of reponsesRes.recordset || []) {
    const revueId = row.id_revue;
    if (!reponsesByRevue.has(revueId)) {
      reponsesByRevue.set(revueId, []);
    }
    reponsesByRevue.get(revueId).push({
      code_question: cleanText(row.code_question),
      libelle_question: cleanText(row.libelle_question),
      reponse: cleanText(row.reponse),
      commentaire: cleanText(row.commentaire),
    });
  }

  return (result.recordset || []).map((row) => {
    const typeRevue = cleanText(row.type_revue);
    const conclusionParts = [
      cleanText(row.conclusion_risque),
      cleanText(row.commentaires_conclusion),
      cleanText(row.niveau_risque_avant) && cleanText(row.niveau_risque_apres)
        ? `Risque: ${cleanText(row.niveau_risque_avant)} -> ${cleanText(row.niveau_risque_apres)}`
        : null,
    ].filter(Boolean);

    return {
      id: typeRevue ? `${typeRevue}-${row.id}` : String(row.id),
      date: row.date_revue ?? null,
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      statut: normalizeStatutRevue(row.statut),
      conclusion: conclusionParts.length ? conclusionParts.join(' | ') : null,
      prochain_rdv: null,
      reponses: reponsesByRevue.get(row.id) || [],
    };
  });
}

const REVUE_REPONSES_META = [
  { code: 'KYC_MAJ', libelle: 'KYC à jour' },
  { code: 'RISQUE_VERIFIE', libelle: 'Risque vérifié' },
  { code: 'PIECES_COMPLETES', libelle: 'Pièces complètes' },
  { code: 'OPS_ATYPIQUES', libelle: 'Opérations atypiques' },
  { code: 'CONCLUSION', libelle: 'Conclusion de la revue' },
];

function buildWizardUrl(codeClient, revueId) {
  const code = encodeURIComponent(codeClient);
  return `/lab/dossier/formulaire?code_client=${code}&id_revue=${revueId}`;
}

function computeConclusionRisque(niveauAvant, niveauApres) {
  const rankAvant = niveauRankForArpec(niveauAvant);
  const rankApres = niveauRankForArpec(niveauApres);
  if (rankApres > rankAvant) return 'Augmentation';
  if (rankApres < rankAvant) return 'Diminution';
  return 'Maintien';
}

export async function resolveRevueCodeClient(revueId) {
  const id = parseEntityId(revueId, 'id revue');
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_revues
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Revue introuvable', 404);
  }
  return code;
}

export async function getRevueEnCours(poolOrTransaction, codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) return null;
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;

  const request = poolOrTransaction instanceof sql.Transaction
    ? new sql.Request(poolOrTransaction)
    : poolOrTransaction.request();

  const result = await request
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT TOP 1
        r.id,
        r.id_evenement,
        r.date_revue,
        r.statut
      FROM lab_revues r
      WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(r.statut)) = N'En_cours'
      ORDER BY r.id DESC
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  return {
    id: row.id,
    id_evenement: row.id_evenement ?? null,
    date_revue: row.date_revue ?? null,
    statut: cleanText(row.statut) || 'En_cours',
    wizard_url: buildWizardUrl(codeSafe, row.id),
  };
}

function extractSirenFromClientRow(row) {
  const digits = (value) => {
    const cleaned = cleanText(value);
    return cleaned ? cleaned.replace(/\D/g, '') : '';
  };
  const siren = digits(row?.siren);
  if (siren.length === 9) return siren;
  const siret = digits(row?.siret);
  if (siret.length >= 9) return siret.slice(0, 9);
  return '';
}

async function assertBodaccCriticalResolvedForRevue(pool, codeClient, checklistState) {
  const sirenRes = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 siret
      FROM clients
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const siren = extractSirenFromClientRow(sirenRes.recordset?.[0]);
  if (siren.length !== 9) {
    return;
  }

  const { fetchBodaccAlertes, countPendingCriticalBodacc } = await import('./lab-enrichment-service.js');
  const bodacc = await fetchBodaccAlertes(siren);
  if (!bodacc.ok) {
    throw new LabDossierError(
      bodacc.error || 'Impossible de vérifier les annonces BODACC — clôture refusée',
      503,
    );
  }

  const pending = countPendingCriticalBodacc(bodacc.alertes, checklistState);
  if (pending > 0) {
    throw new LabDossierError(
      `Clôture refusée : ${pending} annonce(s) BODACC critique(s) non traitée(s)`,
      400,
    );
  }
}

async function assertEvenementsOuvertsPourRevue(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        e.id,
        e.type_evenement,
        e.statut
      FROM lab_evenements e
      WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(e.statut)) IN (N'Ouvert', N'En_cours', N'A_VALIDER')
        AND RTRIM(LTRIM(e.type_evenement)) != N'REVUE_ANNUELLE'
    `);

  const blocking = result.recordset?.[0];
  if (blocking) {
    throw new LabDossierError(
      'Impossible de lancer la revue : des événements sont encore ouverts sur le dossier',
      400,
    );
  }
}

async function evaluateKycMaj(transaction, codeClient, revueOpenedAt = null) {
  if (revueOpenedAt) {
    const auditRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('since', sql.DateTime2, revueOpenedAt)
      .query(`
        SELECT TOP 1 id
        FROM lab_audit_log
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(type_action)) IN (N'MODIF_KYC', N'CREATION_KYC')
          AND date_action >= @since
      `);
    if (auditRes.recordset?.[0]) {
      return 'O';
    }
  }

  const dossierRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 statut_kyc
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const statutKyc = cleanText(dossierRes.recordset?.[0]?.statut_kyc);
  if (statutKyc === 'Complet') return 'O';

  const kycRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 origine_fonds, secteur_activite, zone_geographique_principale
      FROM lab_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const kyc = kycRes.recordset?.[0];
  if (kyc && cleanText(kyc.origine_fonds) && cleanText(kyc.secteur_activite)) {
    return 'O';
  }
  return 'N';
}

async function evaluateRisqueVerifie(transaction, codeClient, revueOpenedAt = null) {
  const request = new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient);

  let query = `
      SELECT TOP 1 id
      FROM lab_arpec_evaluations
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(est_active)) = N'O'
  `;
  if (revueOpenedAt) {
    request.input('since', sql.DateTime2, revueOpenedAt);
    query += ' AND date_evaluation >= @since';
  }
  query += ' ORDER BY date_evaluation DESC, id DESC';

  const result = await request.query(query);
  return result.recordset?.[0] ? 'O' : 'N';
}

async function evaluatePiecesCompletes(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id
      FROM lab_pieces_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(statut)) IN (N'Manquante', N'Perimee', N'Périmée')
    `);
  return result.recordset?.[0] ? 'N' : 'O';
}

async function buildRevuesReponses(transaction, codeClient, revueId, conclusionRisque, commentaires, revueOpenedAt = null) {
  const kycMaj = await evaluateKycMaj(transaction, codeClient, revueOpenedAt);
  const risqueVerifie = await evaluateRisqueVerifie(transaction, codeClient, revueOpenedAt);
  const piecesCompletes = await evaluatePiecesCompletes(transaction, codeClient);
  const conclusionComment = [
    conclusionRisque,
    cleanText(commentaires),
  ].filter(Boolean).join(' — ');

  const values = {
    KYC_MAJ: { reponse: kycMaj, commentaire: kycMaj === 'O' ? 'KYC conforme au moment de la clôture' : 'KYC incomplet' },
    RISQUE_VERIFIE: { reponse: risqueVerifie, commentaire: risqueVerifie === 'O' ? 'Évaluation ARPEC active' : 'Évaluation ARPEC absente' },
    PIECES_COMPLETES: { reponse: piecesCompletes, commentaire: piecesCompletes === 'O' ? 'Aucune pièce manquante ou périmée' : 'Pièces manquantes ou périmées détectées' },
    OPS_ATYPIQUES: { reponse: 'NA', commentaire: 'Hors périmètre MVP — pas d\'écran opérations atypiques' },
    CONCLUSION: { reponse: 'O', commentaire: conclusionComment || conclusionRisque },
  };

  for (const meta of REVUE_REPONSES_META) {
    const item = values[meta.code];
    const existing = await new sql.Request(transaction)
      .input('id_revue', sql.Int, revueId)
      .input('code_question', sql.NChar(50), meta.code)
      .query(`
        SELECT TOP 1 id
        FROM lab_revues_reponses
        WHERE id_revue = @id_revue AND RTRIM(LTRIM(code_question)) = RTRIM(LTRIM(@code_question))
      `);

    if (existing.recordset?.[0]?.id != null) {
      await new sql.Request(transaction)
        .input('id', sql.Int, existing.recordset[0].id)
        .input('reponse', sql.NChar(10), item.reponse)
        .input('commentaire', sql.NVarChar(sql.MAX), item.commentaire)
        .query(`
          UPDATE lab_revues_reponses
          SET reponse = @reponse, commentaire = @commentaire
          WHERE id = @id
        `);
    } else {
      await new sql.Request(transaction)
        .input('id_revue', sql.Int, revueId)
        .input('code_question', sql.NChar(50), meta.code)
        .input('libelle_question', sql.NChar(200), meta.libelle)
        .input('reponse', sql.NChar(10), item.reponse)
        .input('commentaire', sql.NVarChar(sql.MAX), item.commentaire)
        .query(`
          INSERT INTO lab_revues_reponses (
            id_revue, code_question, libelle_question, reponse, commentaire
          )
          VALUES (
            @id_revue, @code_question, @libelle_question, @reponse, @commentaire
          )
        `);
    }
  }
}

export async function getRevuesLab(codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;

  const pool = await poolPromise;
  const revuesRes = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT
        r.id,
        r.code_client,
        r.id_evenement,
        r.type_revue,
        r.date_revue,
        r.id_responsable,
        r.statut,
        r.conclusion_risque,
        r.commentaires_conclusion,
        r.niveau_risque_avant,
        r.niveau_risque_apres,
        r.date_cloture,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_revues r
      LEFT JOIN collaborateurs responsable
        ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(r.id_responsable))
      WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      ORDER BY r.date_revue DESC, r.id DESC
    `);

  const reponsesRes = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT
        rr.id,
        rr.id_revue,
        rr.code_question,
        rr.libelle_question,
        rr.reponse,
        rr.commentaire
      FROM lab_revues_reponses rr
      INNER JOIN lab_revues r ON r.id = rr.id_revue
      WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      ORDER BY rr.id_revue DESC, rr.id ASC
    `);

  const reponsesByRevue = new Map();
  for (const row of reponsesRes.recordset || []) {
    const revueId = row.id_revue;
    if (!reponsesByRevue.has(revueId)) {
      reponsesByRevue.set(revueId, []);
    }
    reponsesByRevue.get(revueId).push({
      code_question: cleanText(row.code_question),
      libelle_question: cleanText(row.libelle_question),
      reponse: cleanText(row.reponse),
      commentaire: cleanText(row.commentaire),
    });
  }

  const data = (revuesRes.recordset || []).map((row) => ({
    id: row.id,
    code_client: cleanText(row.code_client),
    id_evenement: row.id_evenement ?? null,
    type_revue: cleanText(row.type_revue) || 'Annuelle',
    date_revue: row.date_revue ?? null,
    statut: normalizeStatutRevue(row.statut),
    conclusion_risque: cleanText(row.conclusion_risque),
    commentaires_conclusion: cleanText(row.commentaires_conclusion),
    niveau_risque_avant: normalizeNiveauRisque(row.niveau_risque_avant),
    niveau_risque_apres: normalizeNiveauRisque(row.niveau_risque_apres),
    date_cloture: row.date_cloture ?? null,
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    reponses: reponsesByRevue.get(row.id) || [],
  }));

  return { data, total: data.length };
}

export async function createRevueLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const dateRevue = payload?.date_revue != null
    ? parseIsoDate(payload.date_revue)
    : todayUtcDate();
  if (dateRevue === undefined) {
    throw new LabDossierError('date_revue invalide', 400);
  }

  const idResponsable = cleanText(payload?.id_responsable) || cleanText(userId);
  const creePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const enCours = await getRevueEnCours(transaction, codeSafe);
    if (enCours) {
      throw new LabDossierError('Une revue est déjà en cours pour ce dossier', 409);
    }

    await assertEvenementsOuvertsPourRevue(transaction, codeSafe);

    const dossierRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 niveau_risque
        FROM lab_dossier
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
    const niveauRisqueAvant = normalizeNiveauRisqueForStorage(
      dossierRes.recordset?.[0]?.niveau_risque,
    );

    const snapshot = await captureDossierSnapshot(transaction, codeSafe);

    const existingEventRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 id, statut
        FROM lab_evenements
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(type_evenement)) = N'REVUE_ANNUELLE'
          AND RTRIM(LTRIM(statut)) IN (${AUTO_EVENT_OPEN_STATUTS_SQL})
        ORDER BY id DESC
      `);
    const existingEvent = existingEventRes.recordset?.[0];
    let eventId = existingEvent?.id ?? null;
    let eventStatut = cleanText(existingEvent?.statut) || 'Ouvert';
    const eventReused = eventId != null;

    if (!eventReused) {
      const eventRes = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'REVUE_ANNUELLE')
        .input('libelle', sql.NChar(200), 'Revue périodique')
        .input('criticite', sql.NChar(10), 'Moyenne')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, dateRevue ?? todayUtcDate())
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

      eventId = eventRes.recordset?.[0]?.id;
      eventStatut = 'Ouvert';
      if (eventId == null) {
        throw new Error('INSERT lab_evenements REVUE_ANNUELLE sans id retourné');
      }
    }

    const revueRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('id_evenement', sql.Int, eventId)
      .input('type_revue', sql.NChar(30), 'Annuelle')
      .input('date_revue', sql.Date, dateRevue ?? todayUtcDate())
      .input('id_responsable', sql.NChar(20), idResponsable)
      .input('statut', sql.NChar(20), 'En_cours')
      .input('niveau_risque_avant', sql.NChar(10), niveauRisqueAvant)
      .query(`
        INSERT INTO lab_revues (
          code_client, id_evenement, type_revue, date_revue,
          id_responsable, statut, niveau_risque_avant
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client, @id_evenement, @type_revue, @date_revue,
          @id_responsable, @statut, @niveau_risque_avant
        )
      `);

    const revueId = revueRes.recordset?.[0]?.id;
    if (revueId == null) {
      throw new Error('INSERT lab_revues sans id retourné');
    }

    const snapshotDetail = JSON.stringify(snapshot);
    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_REVUE',
      entite: 'lab_revues',
      idEntite: revueId,
      codeClient: codeSafe,
      detail: snapshotDetail,
    });

    if (!eventReused) {
      await writeLabAuditLog(transaction, {
        userId: creePar,
        typeAction: 'CREATION_EVENEMENT',
        entite: 'lab_evenements',
        idEntite: eventId,
        codeClient: codeSafe,
        detail: JSON.stringify({ type_evenement: 'REVUE_ANNUELLE', id_revue: revueId }),
      });
    }

    await transaction.commit();

    return {
      revue: {
        id: revueId,
        code_client: codeSafe,
        id_evenement: eventId,
        statut: 'En_cours',
        date_revue: dateRevue ?? todayUtcDate(),
      },
      evenement: {
        id: eventId,
        type_evenement: 'REVUE_ANNUELLE',
        statut: eventStatut,
        reused: eventReused,
      },
      wizard_url: buildWizardUrl(codeSafe, revueId),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function cloturerRevueLab(revueId, payload, userId = null) {
  const id = parseEntityId(revueId);
  const cloturePar = cleanText(userId);
  const options = payload?.options && typeof payload.options === 'object' ? payload.options : {};
  const checklistState = options.bodacc_checklist && typeof options.bodacc_checklist === 'object'
    ? options.bodacc_checklist
    : {};

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const revueRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 *
        FROM lab_revues
        WHERE id = @id
      `);
    const revue = revueRes.recordset?.[0];
    if (!revue) {
      throw new LabDossierError('Revue introuvable', 404);
    }
    if (cleanText(revue.statut) !== 'En_cours') {
      throw new LabDossierError('Seule une revue En_cours peut être clôturée', 400);
    }

    const codeSafe = cleanText(revue.code_client);
    await assertBodaccCriticalResolvedForRevue(pool, codeSafe, checklistState);
    const niveauAvant = cleanText(revue.niveau_risque_avant);
    const revueOpenedAt = revue.date_creation ?? revue.date_revue;
    if (!revueOpenedAt) {
      throw new LabDossierError('Date d\'ouverture de la revue introuvable', 500);
    }

    const evalRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('since', sql.DateTime2, revueOpenedAt)
      .query(`
        SELECT TOP 1 niveau_retenu
        FROM lab_arpec_evaluations
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(est_active)) = N'O'
          AND date_evaluation >= @since
        ORDER BY date_evaluation DESC, id DESC
      `);
    const niveauApresRaw = cleanText(evalRes.recordset?.[0]?.niveau_retenu);
    if (!niveauApresRaw) {
      throw new LabDossierError('Évaluation ARPEC de la session requise pour clôturer la revue', 400);
    }
    const niveauApres = normalizeNiveauRisqueForStorage(niveauApresRaw);
    const conclusionRisque = computeConclusionRisque(niveauAvant, niveauApres);
    const commentaires = cleanText(payload?.commentaires_conclusion);

    await buildRevuesReponses(transaction, codeSafe, id, conclusionRisque, commentaires, revueOpenedAt);

    const today = todayUtcDate();

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('conclusion_risque', sql.NChar(20), conclusionRisque)
      .input('commentaires_conclusion', sql.NVarChar(sql.MAX), commentaires)
      .input('niveau_risque_apres', sql.NChar(10), niveauApres)
      .input('cloture_par', sql.NChar(20), cloturePar)
      .query(`
        UPDATE lab_revues
        SET
          statut = N'Cloturee',
          conclusion_risque = @conclusion_risque,
          commentaires_conclusion = @commentaires_conclusion,
          niveau_risque_apres = @niveau_risque_apres,
          date_cloture = SYSUTCDATETIME(),
          cloture_par = @cloture_par,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);

    const eventId = revue.id_evenement;
    if (eventId != null) {
      const autoConclusion = [
        'Revue périodique clôturée',
        `Conclusion risque : ${conclusionRisque}`,
        commentaires,
      ].filter(Boolean).join(' — ');

      await new sql.Request(transaction)
        .input('id', sql.Int, eventId)
        .input('conclusion', sql.NVarChar(sql.MAX), autoConclusion)
        .input('cloture_par', sql.NChar(20), cloturePar)
        .query(`
          UPDATE lab_evenements
          SET
            statut = N'Cloture',
            conclusion = @conclusion,
            date_cloture = SYSUTCDATETIME(),
            cloture_par = @cloture_par,
            date_modification = SYSUTCDATETIME(),
            modifie_par = @cloture_par
          WHERE id = @id
        `);

      await writeLabAuditLog(transaction, {
        userId: cloturePar,
        typeAction: 'CLOTURE_EVENEMENT',
        entite: 'lab_evenements',
        idEntite: eventId,
        codeClient: codeSafe,
        detail: JSON.stringify({ type_evenement: 'REVUE_ANNUELLE', source: 'cloture_revue' }),
      });
    }

    const dossierRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 periodicite_revue_mois
        FROM lab_dossier
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
    const periodicite = dossierRes.recordset?.[0]?.periodicite_revue_mois ?? 12;
    const dateProchaine = addMonthsUtc(today, periodicite);

    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('date_derniere_revue', sql.Date, today)
      .input('date_prochaine_revue', sql.Date, dateProchaine)
      .input('modifie_par', sql.NChar(20), cloturePar)
      .query(`
        UPDATE lab_dossier
        SET
          date_derniere_revue = @date_derniere_revue,
          date_prochaine_revue = @date_prochaine_revue,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);

    await writeLabAuditLog(transaction, {
      userId: cloturePar,
      typeAction: 'CLOTURE_REVUE',
      entite: 'lab_revues',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({
        conclusion_risque: conclusionRisque,
        niveau_risque_avant: niveauAvant,
        niveau_risque_apres: niveauApres,
        source: cleanText(options.source) || 'wizard_revision',
      }),
    });

    await transaction.commit();

    return {
      id,
      code_client: codeSafe,
      statut: 'Cloturee',
      conclusion_risque: conclusionRisque,
      niveau_risque_avant: normalizeNiveauRisque(niveauAvant),
      niveau_risque_apres: normalizeNiveauRisque(niveauApres),
      date_derniere_revue: today,
      date_prochaine_revue: dateProchaine,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function annulerRevueLab(revueId, userId = null) {
  const id = parseEntityId(revueId);
  const annulePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const revueRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 * FROM lab_revues WHERE id = @id`);
    const revue = revueRes.recordset?.[0];
    if (!revue) {
      throw new LabDossierError('Revue introuvable', 404);
    }
    if (cleanText(revue.statut) !== 'En_cours') {
      throw new LabDossierError('Seule une revue En_cours peut être annulée', 400);
    }

    const codeSafe = cleanText(revue.code_client);
    const auditRes = await new sql.Request(transaction)
      .input('id_entite', sql.NVarChar(50), String(id))
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 detail
        FROM lab_audit_log
        WHERE type_action = N'CREATION_REVUE'
          AND entite = N'lab_revues'
          AND id_entite = @id_entite
          AND RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        ORDER BY date_action DESC, id DESC
      `);

    const detailRaw = cleanText(auditRes.recordset?.[0]?.detail);
    if (!detailRaw) {
      throw new LabDossierError('Snapshot de revue introuvable pour annulation', 500);
    }

    let snapshot;
    try {
      snapshot = JSON.parse(detailRaw);
    } catch {
      throw new LabDossierError('Snapshot de revue corrompu', 500);
    }

    await restoreDossierSnapshot(transaction, codeSafe, snapshot);

    const eventId = revue.id_evenement;

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        UPDATE lab_revues
        SET
          statut = N'Annulee',
          id_evenement = NULL,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await new sql.Request(transaction)
      .input('id_revue', sql.Int, id)
      .query(`DELETE FROM lab_revues_reponses WHERE id_revue = @id_revue`);

    if (eventId != null) {
      await new sql.Request(transaction)
        .input('id_evenement', sql.Int, eventId)
        .query(`DELETE FROM lab_diligences WHERE id_evenement = @id_evenement`);

      await new sql.Request(transaction)
        .input('id', sql.Int, eventId)
        .query(`DELETE FROM lab_evenements WHERE id = @id`);
    }

    await writeLabAuditLog(transaction, {
      userId: annulePar,
      typeAction: 'ANNULATION_REVUE',
      entite: 'lab_revues',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ id_evenement: eventId, restored: true }),
    });

    await transaction.commit();

    return {
      id,
      code_client: codeSafe,
      statut: 'Annulee',
      revue_en_cours: null,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
