/**
 * Lecture Tracfin et transactions (parking Phase 6 — POST naîtra ici).
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

export async function getTransactionsLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(t.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(t.statut))', type: sql.NVarChar(20) },
    });
    const scopeClause = buildScopeClause(scope, 't.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        t.id,
        t.code_client,
        c.raison_sociale,
        t.id_evenement,
        e.type_evenement,
        t.fec_annee,
        t.fec_ecriture_num,
        t.fec_ecriture_date,
        t.fec_montant,
        t.fec_libelle,
        t.fec_journal_code,
        t.motif_atypique,
        t.statut,
        t.signale_par,
        t.date_signalement,
        signaleur.nom AS signaleur_nom,
        signaleur.prenom AS signaleur_prenom
      FROM lab_transactions_atypiques t
      LEFT JOIN lab_evenements e ON e.id = t.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(t.code_client))
      LEFT JOIN collaborateurs signaleur ON RTRIM(LTRIM(signaleur.id_sellsy)) = RTRIM(LTRIM(t.signale_par))
      ${where}
      ORDER BY t.date_signalement DESC, t.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      id_evenement: row.id_evenement ?? null,
      type_evenement: cleanText(row.type_evenement),
      fec_annee: row.fec_annee ?? null,
      fec_ecriture_num: cleanText(row.fec_ecriture_num),
      fec_ecriture_date: row.fec_ecriture_date ?? null,
      fec_montant: row.fec_montant ?? null,
      fec_libelle: cleanText(row.fec_libelle),
      fec_journal_code: cleanText(row.fec_journal_code),
      motif_atypique: cleanText(row.motif_atypique),
      statut: cleanText(row.statut),
      signale_par: formatCollaborateur(row.signaleur_prenom, row.signaleur_nom, row.signale_par),
      date_signalement: row.date_signalement ?? null,
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getTransactionsLab:', err);
    throw err;
  }
}

/**
 * Liste des dossiers TRACFIN du cabinet.
 * Pas de filtre D14 : un isFull voit tout le cabinet. L'accès est réservé à
 * l'équipe LAB (assertTracfinAccess / L.561-18) côté controller.
 */
export async function getTracfinLab(filters = {}, _scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(t.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(t.statut))', type: sql.NVarChar(30) },
    });
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        t.id,
        t.code_client,
        c.raison_sociale,
        t.id_evenement,
        e.type_evenement,
        t.nature_soupcon,
        t.description_operations,
        t.montants_concernes,
        t.periode_concernee_debut,
        t.periode_concernee_fin,
        t.diligences_effectuees,
        t.statut,
        t.date_declaration,
        t.reference_declaration,
        t.declare_par,
        declarant.nom AS declarant_nom,
        declarant.prenom AS declarant_prenom
      FROM lab_tracfin t
      LEFT JOIN lab_evenements e ON e.id = t.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(t.code_client))
      LEFT JOIN collaborateurs declarant ON RTRIM(LTRIM(declarant.id_sellsy)) = RTRIM(LTRIM(t.declare_par))
      ${where}
      ORDER BY t.date_creation DESC, t.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      id_evenement: row.id_evenement ?? null,
      type_evenement: cleanText(row.type_evenement),
      nature_soupcon: cleanText(row.nature_soupcon),
      description_operations: cleanText(row.description_operations),
      montants_concernes: cleanText(row.montants_concernes),
      periode_concernee_debut: row.periode_concernee_debut ?? null,
      periode_concernee_fin: row.periode_concernee_fin ?? null,
      diligences_effectuees: cleanText(row.diligences_effectuees),
      statut: cleanText(row.statut),
      date_declaration: row.date_declaration ?? null,
      reference_declaration: cleanText(row.reference_declaration),
      declare_par: formatCollaborateur(row.declarant_prenom, row.declarant_nom, row.declare_par),
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getTracfinLab:', err);
    throw err;
  }
}
