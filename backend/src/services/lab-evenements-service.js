/**
 * Événements LAB : listes, CRUD, clôture, loader GET dossier.
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

import { mapEvenementRow, mapDiligenceRow } from './lab-plan-map.js';

export async function getEvenementsDossierLab(pool, codeClient) {
  const query = `
    SELECT
      e.id,
      e.type_evenement,
      e.libelle,
      e.criticite,
      e.statut,
      e.date_evenement,
      e.date_echeance,
      e.conclusion,
      e.id_responsable,
      responsable.nom AS responsable_nom,
      responsable.prenom AS responsable_prenom
    FROM lab_evenements e
    LEFT JOIN collaborateurs responsable
      ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(e.id_responsable))
    WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY
      CASE WHEN RTRIM(LTRIM(e.statut)) = 'Cloture' THEN 1 ELSE 0 END,
      e.date_evenement DESC,
      e.id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => {
    const type = cleanText(row.type_evenement) || 'AUTRE';
    return {
      id: String(row.id),
      type,
      date_creation: row.date_evenement ?? null,
      criticite: normalizeCriticite(row.criticite),
      statut: cleanText(row.statut) || 'Ouvert',
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      echeance: row.date_echeance ?? null,
      resume: cleanText(row.libelle) || cleanText(row.conclusion) || type,
      conclusion: cleanText(row.conclusion),
    };
  });
}

export async function getEvenementsLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(e.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(e.statut))', type: sql.NVarChar(20) },
      criticite: { column: 'RTRIM(LTRIM(e.criticite))', type: sql.NVarChar(10) },
    });
    const idEvenement = Number(filters.id);
    if (Number.isInteger(idEvenement) && idEvenement > 0) {
      request.input('id_evenement', sql.Int, idEvenement);
      clauses.push('e.id = @id_evenement');
    }
    if (filters.ouverts === '1' || filters.ouverts === 'true') {
      clauses.push(`RTRIM(LTRIM(e.statut)) != N'Cloture'`);
    }
    const scopeClause = buildScopeClause(scope, 'e.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        e.id,
        e.code_client,
        c.raison_sociale,
        e.type_evenement,
        e.libelle,
        e.criticite,
        e.statut,
        e.date_evenement,
        e.date_echeance,
        e.id_responsable,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom,
        (SELECT COUNT(*) FROM lab_diligences di WHERE di.id_evenement = e.id) AS nb_diligences
      FROM lab_evenements e
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(e.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(e.id_responsable))
      ${where}
      ORDER BY e.date_evenement DESC, e.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      type_evenement: cleanText(row.type_evenement),
      libelle: cleanText(row.libelle),
      criticite: normalizeCriticite(row.criticite),
      statut: cleanText(row.statut),
      date_evenement: row.date_evenement ?? null,
      date_echeance: row.date_echeance ?? null,
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      nb_diligences: row.nb_diligences ?? 0,
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getEvenementsLab:', err);
    throw err;
  }
}

const MANUAL_FORBIDDEN_EVENT_TYPES = new Set([
  'ENTREE_RELATION',
  'CHANGEMENT_BE',
  'CHANGEMENT_RISQUE',
  'REVUE_ANNUELLE',
  'PLAN_VIGILANCE',
]);

async function fetchDossierResponsableLab(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id_responsable_lab
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  return cleanText(result.recordset?.[0]?.id_responsable_lab);
}

function assertCanValiderClotureEvenement(scope, idResponsableLab) {
  if (scope?.isFull === true) return;
  const responsable = cleanText(idResponsableLab);
  if (!responsable) {
    throw new LabDossierError('Aucun responsable LAB assigné', 403);
  }
  const actor = cleanText(scope?.idSellsy);
  if (!actor || actor !== responsable) {
    throw new LabDossierError('Clôture réservée au responsable du dossier', 403);
  }
}

async function assertDiligencesPretesPourCloture(transaction, eventId) {
  const openDiligences = await new sql.Request(transaction)
    .input('id_evenement', sql.Int, eventId)
    .query(`
      SELECT id, statut, motif_abandon
      FROM lab_diligences
      WHERE id_evenement = @id_evenement
        AND RTRIM(LTRIM(statut)) NOT IN (N'Realisee', N'Abandonnee')
    `);
  if ((openDiligences.recordset || []).length > 0) {
    throw new LabDossierError(
      'Toutes les diligences liées doivent être Réalisées ou Abandonnées avant clôture',
      400,
    );
  }

  const abandoned = await new sql.Request(transaction)
    .input('id_evenement', sql.Int, eventId)
    .query(`
      SELECT id FROM lab_diligences
      WHERE id_evenement = @id_evenement
        AND RTRIM(LTRIM(statut)) = N'Abandonnee'
        AND (motif_abandon IS NULL OR RTRIM(LTRIM(motif_abandon)) = N'')
    `);
  if ((abandoned.recordset || []).length > 0) {
    throw new LabDossierError('motif_abandon requis pour les diligences abandonnées', 400);
  }
}

function resolveTracfinForCloture(typeEvenement, payload, existing = null) {
  if (typeEvenement !== 'TRANSACTION_ATYPIQUE') {
    return { tracfinDeclare: null, tracfinCommentaire: null };
  }
  const fromPayload = cleanText(payload?.tracfin_declare)?.toUpperCase();
  const fromExisting = cleanText(existing?.tracfin_declare)?.toUpperCase();
  const tracfinDeclare = fromPayload || fromExisting;
  if (tracfinDeclare !== 'O' && tracfinDeclare !== 'N') {
    throw new LabDossierError('tracfin_declare requis (O ou N) pour TRANSACTION_ATYPIQUE', 400);
  }
  let tracfinCommentaire = null;
  if (tracfinDeclare === 'O') {
    tracfinCommentaire = cleanText(payload?.tracfin_commentaire) || cleanText(existing?.tracfin_commentaire);
    if (!tracfinCommentaire) {
      throw new LabDossierError('tracfin_commentaire requis si tracfin_declare = O', 400);
    }
  }
  return { tracfinDeclare, tracfinCommentaire };
}

export async function fetchEvenementById(transaction, id) {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1
        e.id,
        e.code_client,
        e.type_evenement,
        e.libelle,
        e.criticite,
        e.statut,
        e.date_evenement,
        e.date_echeance,
        e.conclusion,
        e.tracfin_declare,
        e.tracfin_commentaire,
        e.id_responsable
      FROM lab_evenements e
      WHERE e.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Événement introuvable', 404);
  }
  return row;
}

async function fetchEvenementEnriched(transaction, eventId) {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, eventId)
    .query(`
      SELECT
        e.id,
        e.code_client,
        c.raison_sociale,
        e.type_evenement,
        e.libelle,
        e.criticite,
        e.statut,
        e.date_evenement,
        e.date_echeance,
        e.id_responsable,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom,
        (SELECT COUNT(*) FROM lab_diligences di WHERE di.id_evenement = e.id) AS nb_diligences
      FROM lab_evenements e
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(e.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(e.id_responsable))
      WHERE e.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Événement introuvable', 404);
  }
  const evenement = mapEvenementRow(row);
  const dilResult = await new sql.Request(transaction)
    .input('id_evenement', sql.Int, eventId)
    .query(`
      SELECT
        d.id,
        d.id_evenement,
        d.code_client,
        c.raison_sociale,
        e.type_evenement,
        d.intitule,
        d.type_diligence,
        d.id_responsable,
        d.date_echeance,
        d.statut,
        d.date_realisation,
        d.commentaires,
        d.ref_piece_jointe,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_diligences d
      LEFT JOIN lab_evenements e ON e.id = d.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
      WHERE d.id_evenement = @id_evenement
      ORDER BY d.id ASC
    `);
  evenement.diligences = (dilResult.recordset || []).map(mapDiligenceRow);
  return evenement;
}

export async function resolveEvenementCodeClient(eventId) {
  const id = parseEntityId(eventId, 'id événement');
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_evenements
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Événement introuvable', 404);
  }
  return code;
}

export async function createEvenementLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const typeEvenement = cleanText(payload?.type_evenement) || 'AUTRE';
  if (MANUAL_FORBIDDEN_EVENT_TYPES.has(typeEvenement)) {
    throw new LabDossierError(`Type d'événement réservé : ${typeEvenement}`, 400);
  }

  const libelle = cleanText(payload?.libelle) || defaultLibelleEvenement(typeEvenement);
  const criticite = normalizeCriticite(payload?.criticite ?? 'Moyenne');
  const statut = cleanText(payload?.statut) || 'Ouvert';
  if (!['Ouvert', 'En_cours'].includes(statut)) {
    throw new LabDossierError('statut invalide à la création (Ouvert ou En_cours)', 400);
  }

  const dateEvenement = payload?.date_evenement != null
    ? parseIsoDate(payload.date_evenement)
    : todayUtcDate();
  if (dateEvenement === undefined) {
    throw new LabDossierError('date_evenement invalide', 400);
  }

  let dateEcheance = null;
  if (payload?.date_echeance !== undefined) {
    if (payload.date_echeance == null || String(payload.date_echeance).trim() === '') {
      dateEcheance = null;
    } else {
      dateEcheance = parseIsoDate(payload.date_echeance);
      if (dateEcheance === undefined) {
        throw new LabDossierError('date_echeance invalide', 400);
      }
    }
  }

  const idResponsable = cleanText(payload?.id_responsable) || cleanText(userId);
  const creePar = cleanText(userId);
  const nestedDiligences = Array.isArray(payload?.diligences) ? payload.diligences : [];

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const eventRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('type_evenement', sql.NChar(50), typeEvenement)
      .input('libelle', sql.NChar(200), libelle)
      .input('criticite', sql.NChar(10), criticite)
      .input('statut', sql.NChar(20), statut)
      .input('date_evenement', sql.Date, dateEvenement ?? todayUtcDate())
      .input('date_echeance', sql.Date, dateEcheance)
      .input('id_responsable', sql.NChar(20), idResponsable)
      .input('cree_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_evenements (
          code_client, type_evenement, libelle, criticite, statut,
          date_evenement, date_echeance, id_responsable, cree_par, modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client, @type_evenement, @libelle, @criticite, @statut,
          @date_evenement, @date_echeance, @id_responsable, @cree_par, @cree_par
        )
      `);

    const eventId = eventRes.recordset?.[0]?.id;
    if (eventId == null) {
      throw new Error('INSERT lab_evenements sans id retourné');
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_EVENEMENT',
      entite: 'lab_evenements',
      idEntite: eventId,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_evenement: typeEvenement, libelle, criticite, statut }),
    });

    for (const dil of nestedDiligences) {
      const intitule = cleanText(dil?.intitule);
      if (!intitule) {
        throw new LabDossierError('intitule requis pour chaque diligence', 400);
      }
      let dilEcheance = null;
      if (dil?.date_echeance != null && String(dil.date_echeance).trim() !== '') {
        dilEcheance = parseIsoDate(dil.date_echeance);
        if (dilEcheance === undefined) {
          throw new LabDossierError('date_echeance diligence invalide', 400);
        }
      }

      const dilRes = await new sql.Request(transaction)
        .input('id_evenement', sql.Int, eventId)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('intitule', sql.NChar(200), intitule)
        .input('type_diligence', sql.NChar(50), cleanText(dil?.type_diligence) || 'Manuelle')
        .input('id_responsable', sql.NChar(20), cleanText(dil?.id_responsable) || idResponsable)
        .input('date_echeance', sql.Date, dilEcheance)
        .input('statut', sql.NChar(20), 'A_faire')
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_diligences (
            id_evenement, code_client, intitule, type_diligence,
            id_responsable, date_echeance, statut, cree_par, modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @id_evenement, @code_client, @intitule, @type_diligence,
            @id_responsable, @date_echeance, @statut, @cree_par, @cree_par
          )
        `);

      const dilId = dilRes.recordset?.[0]?.id;
      await writeLabAuditLog(transaction, {
        userId: creePar,
        typeAction: 'CREATION_DILIGENCE',
        entite: 'lab_diligences',
        idEntite: dilId,
        codeClient: codeSafe,
        detail: JSON.stringify({ id_evenement: eventId, intitule }),
      });
    }

    const data = await fetchEvenementEnriched(transaction, eventId);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function updateEvenementLab(eventId, payload, userId = null) {
  const id = parseEntityId(eventId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await fetchEvenementById(transaction, id);
    const statut = cleanText(existing.statut);
    if (statut === 'Cloture') {
      throw new LabDossierError('Événement clôturé : modification interdite', 400);
    }
    if (statut === 'A_VALIDER') {
      throw new LabDossierError('Événement en attente de validation : modification interdite', 400);
    }
    if (cleanText(existing.type_evenement) === 'REVUE_ANNUELLE') {
      throw new LabDossierError('Événement REVUE_ANNUELLE : modification manuelle interdite', 400);
    }

    const sets = ['date_modification = SYSUTCDATETIME()', 'modifie_par = @modifie_par'];
    const request = new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('modifie_par', sql.NChar(20), modifiePar);

    if (payload?.libelle !== undefined) {
      request.input('libelle', sql.NChar(200), cleanText(payload.libelle));
      sets.push('libelle = @libelle');
    }
    if (payload?.criticite !== undefined) {
      request.input('criticite', sql.NChar(10), normalizeCriticite(payload.criticite));
      sets.push('criticite = @criticite');
    }
    if (payload?.statut !== undefined) {
      const newStatut = cleanText(payload.statut);
      if (!['Ouvert', 'En_cours'].includes(newStatut)) {
        throw new LabDossierError('statut invalide (Ouvert ou En_cours)', 400);
      }
      request.input('statut', sql.NChar(20), newStatut);
      sets.push('statut = @statut');
    }
    if (payload?.date_echeance !== undefined) {
      if (payload.date_echeance == null || String(payload.date_echeance).trim() === '') {
        request.input('date_echeance', sql.Date, null);
      } else {
        const dateEcheance = parseIsoDate(payload.date_echeance);
        if (dateEcheance === undefined) {
          throw new LabDossierError('date_echeance invalide', 400);
        }
        request.input('date_echeance', sql.Date, dateEcheance);
      }
      sets.push('date_echeance = @date_echeance');
    }
    if (payload?.id_responsable !== undefined) {
      request.input('id_responsable', sql.NChar(20), cleanText(payload.id_responsable));
      sets.push('id_responsable = @id_responsable');
    }

    if (sets.length <= 2) {
      throw new LabDossierError('Aucun champ modifiable fourni', 400);
    }

    await request.query(`
      UPDATE lab_evenements
      SET ${sets.join(', ')}
      WHERE id = @id
    `);

    const data = await fetchEvenementEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function demanderClotureEvenementLab(eventId, payload, userId = null) {
  const id = parseEntityId(eventId);
  const conclusion = cleanText(payload?.conclusion);
  if (!conclusion) {
    throw new LabDossierError('conclusion requise pour demander la clôture', 400);
  }

  const demandePar = cleanText(userId);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await fetchEvenementById(transaction, id);
    const codeSafe = cleanText(existing.code_client);
    const typeEvenement = cleanText(existing.type_evenement);
    const statut = cleanText(existing.statut);

    if (typeEvenement === 'REVUE_ANNUELLE') {
      throw new LabDossierError(
        'Clôture de REVUE_ANNUELLE via PUT /api/lab/revues/cloturer uniquement',
        400,
      );
    }
    if (statut === 'Cloture') {
      throw new LabDossierError('Événement déjà clôturé', 400);
    }
    if (statut === 'A_VALIDER') {
      throw new LabDossierError('Clôture déjà demandée', 400);
    }
    if (!['Ouvert', 'En_cours'].includes(statut)) {
      throw new LabDossierError('Statut incompatible avec une demande de clôture', 400);
    }

    await assertDiligencesPretesPourCloture(transaction, id);
    const { tracfinDeclare, tracfinCommentaire } = resolveTracfinForCloture(
      typeEvenement,
      payload,
      null,
    );

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('conclusion', sql.NVarChar(sql.MAX), conclusion)
      .input('tracfin_declare', sql.NChar(1), tracfinDeclare)
      .input('tracfin_commentaire', sql.NVarChar(sql.MAX), tracfinCommentaire)
      .input('demande_cloture_par', sql.NChar(20), demandePar)
      .query(`
        UPDATE lab_evenements
        SET
          statut = N'A_VALIDER',
          conclusion = @conclusion,
          tracfin_declare = @tracfin_declare,
          tracfin_commentaire = @tracfin_commentaire,
          demande_cloture_par = @demande_cloture_par,
          date_demande_cloture = SYSUTCDATETIME(),
          motif_refus = NULL,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @demande_cloture_par
        WHERE id = @id
      `);

    await writeLabAuditLog(transaction, {
      userId: demandePar,
      typeAction: 'DEMANDE_CLOTURE_EVENEMENT',
      entite: 'lab_evenements',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_evenement: typeEvenement, conclusion }),
    });

    const data = await fetchEvenementEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function cloturerEvenementLab(eventId, payload, userId = null, scope = null) {
  const id = parseEntityId(eventId);
  const cloturePar = cleanText(userId);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await fetchEvenementById(transaction, id);
    const codeSafe = cleanText(existing.code_client);
    const typeEvenement = cleanText(existing.type_evenement);
    const statut = cleanText(existing.statut);

    if (typeEvenement === 'REVUE_ANNUELLE') {
      throw new LabDossierError(
        'Clôture de REVUE_ANNUELLE via PUT /api/lab/revues/cloturer uniquement',
        400,
      );
    }
    if (statut === 'Cloture') {
      throw new LabDossierError('Événement déjà clôturé', 400);
    }
    if (!['Ouvert', 'En_cours', 'A_VALIDER'].includes(statut)) {
      throw new LabDossierError('Statut incompatible avec la clôture', 400);
    }

    const idResponsableLab = await fetchDossierResponsableLab(transaction, codeSafe);
    assertCanValiderClotureEvenement(scope, idResponsableLab);

    const conclusion = cleanText(payload?.conclusion) || cleanText(existing.conclusion);
    if (!conclusion) {
      throw new LabDossierError('conclusion requise pour clôturer l\'événement', 400);
    }

    await assertDiligencesPretesPourCloture(transaction, id);
    const { tracfinDeclare, tracfinCommentaire } = resolveTracfinForCloture(
      typeEvenement,
      payload,
      existing,
    );

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('conclusion', sql.NVarChar(sql.MAX), conclusion)
      .input('tracfin_declare', sql.NChar(1), tracfinDeclare)
      .input('tracfin_commentaire', sql.NVarChar(sql.MAX), tracfinCommentaire)
      .input('cloture_par', sql.NChar(20), cloturePar)
      .query(`
        UPDATE lab_evenements
        SET
          statut = N'Cloture',
          conclusion = @conclusion,
          tracfin_declare = @tracfin_declare,
          tracfin_commentaire = @tracfin_commentaire,
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
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({
        type_evenement: typeEvenement,
        conclusion,
        mode: statut === 'A_VALIDER' ? 'validation' : 'directe',
      }),
    });

    const data = await fetchEvenementEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function refuserClotureEvenementLab(eventId, payload, userId = null, scope = null) {
  const id = parseEntityId(eventId);
  const motifRefus = cleanText(payload?.motif_refus);
  if (!motifRefus) {
    throw new LabDossierError('motif_refus requis', 400);
  }

  const refusePar = cleanText(userId);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await fetchEvenementById(transaction, id);
    const codeSafe = cleanText(existing.code_client);
    const typeEvenement = cleanText(existing.type_evenement);
    const statut = cleanText(existing.statut);

    if (typeEvenement === 'REVUE_ANNUELLE') {
      throw new LabDossierError(
        'Clôture de REVUE_ANNUELLE via PUT /api/lab/revues/cloturer uniquement',
        400,
      );
    }
    if (statut !== 'A_VALIDER') {
      throw new LabDossierError('Refus possible uniquement sur un événement en attente de validation', 400);
    }

    const idResponsableLab = await fetchDossierResponsableLab(transaction, codeSafe);
    assertCanValiderClotureEvenement(scope, idResponsableLab);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('motif_refus', sql.NVarChar(500), motifRefus)
      .input('refuse_par', sql.NChar(20), refusePar)
      .query(`
        UPDATE lab_evenements
        SET
          statut = N'En_cours',
          motif_refus = @motif_refus,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @refuse_par
        WHERE id = @id
      `);

    await writeLabAuditLog(transaction, {
      userId: refusePar,
      typeAction: 'REFUS_CLOTURE_EVENEMENT',
      entite: 'lab_evenements',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_evenement: typeEvenement, motif_refus: motifRefus }),
    });

    const data = await fetchEvenementEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
