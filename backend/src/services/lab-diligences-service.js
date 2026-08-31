/**
 * Diligences LAB : listes, CRUD, loader GET dossier.
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

import { mapDiligenceRow } from './lab-plan-map.js';
import { fetchEvenementById } from './lab-evenements-service.js';

export async function getDiligencesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      d.id,
      d.id_evenement,
      d.intitule,
      d.type_diligence,
      d.id_responsable,
      d.date_echeance,
      d.statut,
      d.motif_abandon,
      d.commentaires,
      d.ref_piece_jointe,
      responsable.nom AS responsable_nom,
      responsable.prenom AS responsable_prenom
    FROM lab_diligences d
    LEFT JOIN collaborateurs responsable
      ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
    WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY
      CASE WHEN RTRIM(LTRIM(d.statut)) IN ('Realisee', 'Abandonnee') THEN 1 ELSE 0 END,
      d.date_echeance ASC,
      d.id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => ({
    id: String(row.id),
    evenement_id: row.id_evenement != null ? String(row.id_evenement) : null,
    intitule: cleanText(row.intitule) || 'Diligence sans intitulé',
    type_diligence: cleanText(row.type_diligence),
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    statut: cleanText(row.statut) || 'A_faire',
    date_echeance: row.date_echeance ?? null,
    preuve: cleanText(row.ref_piece_jointe),
    commentaire: cleanText(row.commentaires) || cleanText(row.motif_abandon),
  }));
}

export async function getDiligencesLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(d.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(d.statut))', type: sql.NVarChar(20) },
      id_responsable: { column: 'RTRIM(LTRIM(d.id_responsable))', type: sql.NVarChar(20) },
    });
    const idEvenement = Number(filters.id_evenement);
    if (Number.isInteger(idEvenement) && idEvenement > 0) {
      request.input('id_evenement', sql.Int, idEvenement);
      clauses.push('d.id_evenement = @id_evenement');
    }
    const scopeClause = buildScopeClause(scope, 'd.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
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
      ${where}
      ORDER BY
        CASE WHEN RTRIM(LTRIM(d.statut)) IN ('Realisee', 'Abandonnee') THEN 1 ELSE 0 END,
        d.date_echeance ASC,
        d.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      id_evenement: row.id_evenement,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      type_evenement: cleanText(row.type_evenement),
      intitule: cleanText(row.intitule),
      type_diligence: cleanText(row.type_diligence),
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      date_echeance: row.date_echeance ?? null,
      statut: cleanText(row.statut),
      date_realisation: row.date_realisation ?? null,
      commentaires: cleanText(row.commentaires),
      ref_piece_jointe: cleanText(row.ref_piece_jointe),
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getDiligencesLab:', err);
    throw err;
  }
}

const DILIGENCE_STATUT_TRANSITIONS = {
  A_faire: new Set(['En_cours']),
  En_cours: new Set(['Realisee', 'Abandonnee']),
  Realisee: new Set(),
  Abandonnee: new Set(),
};

async function fetchDiligenceEnriched(transaction, diligenceId) {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, diligenceId)
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
        d.motif_abandon,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_diligences d
      LEFT JOIN lab_evenements e ON e.id = d.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
      WHERE d.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Diligence introuvable', 404);
  }
  return mapDiligenceRow(row);
}

export async function resolveDiligenceCodeClient(diligenceId) {
  const id = parseEntityId(diligenceId, 'id diligence');
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_diligences
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Diligence introuvable', 404);
  }
  return code;
}

export async function createDiligenceLab(payload, userId = null) {
  const idEvenement = parseEntityId(payload?.id_evenement, 'id_evenement');
  const intitule = cleanText(payload?.intitule);
  if (!intitule) {
    throw new LabDossierError('intitule requis', 400);
  }

  const creePar = cleanText(userId);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const event = await fetchEvenementById(transaction, idEvenement);
    const eventStatut = cleanText(event.statut);
    if (eventStatut === 'A_VALIDER') {
      throw new LabDossierError('Diligence impossible : événement en attente de validation', 400);
    }
    if (!['Ouvert', 'En_cours'].includes(eventStatut)) {
      throw new LabDossierError('Diligence impossible : événement non ouvert', 400);
    }

    const codeSafe = cleanText(event.code_client);
    let dateEcheance = null;
    if (payload?.date_echeance != null && String(payload.date_echeance).trim() !== '') {
      dateEcheance = parseIsoDate(payload.date_echeance);
      if (dateEcheance === undefined) {
        throw new LabDossierError('date_echeance invalide', 400);
      }
    }

    const dilRes = await new sql.Request(transaction)
      .input('id_evenement', sql.Int, idEvenement)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('intitule', sql.NChar(200), intitule)
      .input('type_diligence', sql.NChar(50), cleanText(payload?.type_diligence) || 'Manuelle')
      .input('id_responsable', sql.NChar(20), cleanText(payload?.id_responsable) || cleanText(event.id_responsable) || creePar)
      .input('date_echeance', sql.Date, dateEcheance)
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
    if (dilId == null) {
      throw new Error('INSERT lab_diligences sans id retourné');
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_DILIGENCE',
      entite: 'lab_diligences',
      idEntite: dilId,
      codeClient: codeSafe,
      detail: JSON.stringify({ id_evenement: idEvenement, intitule }),
    });

    const data = await fetchDiligenceEnriched(transaction, dilId);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function updateDiligenceLab(diligenceId, payload, userId = null) {
  const id = parseEntityId(diligenceId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existingRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT id, code_client, statut, id_evenement
        FROM lab_diligences
        WHERE id = @id
      `);
    const existing = existingRes.recordset?.[0];
    if (!existing) {
      throw new LabDossierError('Diligence introuvable', 404);
    }

    const currentStatut = cleanText(existing.statut) || 'A_faire';
    const codeSafe = cleanText(existing.code_client);
    const sets = ['date_modification = SYSUTCDATETIME()', 'modifie_par = @modifie_par'];
    const request = new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('modifie_par', sql.NChar(20), modifiePar);

    let auditCloture = false;

    if (payload?.statut !== undefined) {
      const newStatut = cleanText(payload.statut);
      const allowed = DILIGENCE_STATUT_TRANSITIONS[currentStatut];
      if (!allowed || !allowed.has(newStatut)) {
        throw new LabDossierError(
          `Transition de statut invalide : ${currentStatut} → ${newStatut}`,
          400,
        );
      }
      if (newStatut === 'Abandonnee') {
        const motif = cleanText(payload?.motif_abandon);
        if (!motif) {
          throw new LabDossierError('motif_abandon requis pour Abandonnee', 400);
        }
        request.input('motif_abandon', sql.NVarChar(500), motif);
        sets.push('motif_abandon = @motif_abandon');
      }
      if (newStatut === 'Realisee') {
        request.input('date_realisation', sql.DateTime2, new Date());
        request.input('realise_par', sql.NChar(20), modifiePar);
        sets.push('date_realisation = @date_realisation');
        sets.push('realise_par = @realise_par');
      }
      request.input('statut', sql.NChar(20), newStatut);
      sets.push('statut = @statut');
      if (newStatut === 'Realisee' || newStatut === 'Abandonnee') {
        auditCloture = true;
      }
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
    if (payload?.commentaires !== undefined) {
      request.input('commentaires', sql.NVarChar(sql.MAX), cleanText(payload.commentaires));
      sets.push('commentaires = @commentaires');
    }
    if (payload?.ref_piece_jointe !== undefined) {
      request.input('ref_piece_jointe', sql.NVarChar(500), cleanText(payload.ref_piece_jointe));
      sets.push('ref_piece_jointe = @ref_piece_jointe');
    }

    if (sets.length <= 2) {
      throw new LabDossierError('Aucun champ modifiable fourni', 400);
    }

    await request.query(`
      UPDATE lab_diligences
      SET ${sets.join(', ')}
      WHERE id = @id
    `);

    if (auditCloture) {
      await writeLabAuditLog(transaction, {
        userId: modifiePar,
        typeAction: 'CLOTURE_DILIGENCE',
        entite: 'lab_diligences',
        idEntite: id,
        codeClient: codeSafe,
        detail: JSON.stringify({
          statut: cleanText(payload?.statut),
          id_evenement: existing.id_evenement,
        }),
      });
    }

    const data = await fetchDiligenceEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
