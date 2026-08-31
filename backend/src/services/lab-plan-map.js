/**
 * Mappers événements / diligences (évite un cycle evenements ↔ diligences).
 * Extrait de labService.js — Phase 7.4 Vague 2 (DEV/code). Comportement inchangé.
 */

import { cleanText, formatCollaborateur, normalizeCriticite } from './lab-utils.js';

export function mapEvenementRow(row) {
  return {
    id: row.id,
    code_client: cleanText(row.code_client),
    client: cleanText(row.raison_sociale),
    type_evenement: cleanText(row.type_evenement),
    libelle: cleanText(row.libelle),
    criticite: normalizeCriticite(row.criticite),
    statut: cleanText(row.statut) || 'Ouvert',
    date_evenement: row.date_evenement ?? null,
    date_echeance: row.date_echeance ?? null,
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    nb_diligences: row.nb_diligences ?? 0,
  };
}

export function mapDiligenceRow(row) {
  return {
    id: row.id,
    id_evenement: row.id_evenement,
    code_client: cleanText(row.code_client),
    client: cleanText(row.raison_sociale),
    type_evenement: cleanText(row.type_evenement),
    intitule: cleanText(row.intitule),
    type_diligence: cleanText(row.type_diligence),
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    date_echeance: row.date_echeance ?? null,
    statut: cleanText(row.statut) || 'A_faire',
    date_realisation: row.date_realisation ?? null,
    commentaires: cleanText(row.commentaires),
    ref_piece_jointe: cleanText(row.ref_piece_jointe),
  };
}
