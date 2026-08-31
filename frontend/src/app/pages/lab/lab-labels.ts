/** Libellés écran cabinet — jamais d’enum technique ni de nom de colonne. */

const EVENT_TYPE_LABELS: Record<string, string> = {
  PIECE_MANQUANTE: 'Pièce manquante',
  PIECE_PERIMEE: 'Pièce périmée',
  CHANGEMENT_KYC: 'Changement KYC',
  TRANSACTION_ATYPIQUE: 'Transaction atypique',
  PLAN_VIGILANCE: 'Plan de vigilance',
  REVUE_ANNUELLE: 'Revue périodique',
  AUTRE: 'Autre événement',
  ENTREE_RELATION: 'Entrée en relation',
  CHANGEMENT_BE: 'Changement de bénéficiaire',
  CHANGEMENT_RISQUE: 'Changement de risque',
};

const DILIGENCE_TYPE_LABELS: Record<string, string> = {
  Standard: 'Standard',
  Renforcee: 'Renforcée',
  Manuelle: 'Manuelle',
};

const EVENT_STATUT_LABELS: Record<string, string> = {
  Ouvert: 'Ouvert',
  En_cours: 'En cours',
  A_VALIDER: 'À valider',
  Cloture: 'Clôturé',
};

const DILIGENCE_STATUT_LABELS: Record<string, string> = {
  A_faire: 'À faire',
  En_cours: 'En cours',
  Realisee: 'Réalisée',
  Abandonnee: 'Abandonnée',
};

const REVUE_STATUT_LABELS: Record<string, string> = {
  En_cours: 'En cours',
  Cloturee: 'Clôturée',
  Annulee: 'Annulée',
};

const PIECE_STATUT_LABELS: Record<string, string> = {
  Recue: 'Reçue',
  Manquante: 'Manquante',
  Perimee: 'Périmée',
  Non_requise: 'Non requise',
};

function lookup(map: Record<string, string>, value: string | null | undefined, fallback?: string): string {
  const v = value != null ? String(value).trim() : '';
  if (!v) return '—';
  if (map[v]) return map[v];
  return fallback ?? v.replace(/_/g, ' ');
}

export function typeEvenementLabel(value: string | null | undefined): string {
  return lookup(EVENT_TYPE_LABELS, value);
}

export function typeDiligenceLabel(value: string | null | undefined): string {
  return lookup(DILIGENCE_TYPE_LABELS, value);
}

export function statutEvenementLabel(value: string | null | undefined): string {
  return lookup(EVENT_STATUT_LABELS, value);
}

export function statutDiligenceLabel(value: string | null | undefined): string {
  return lookup(DILIGENCE_STATUT_LABELS, value);
}

export function statutRevueLabel(value: string | null | undefined): string {
  return lookup(REVUE_STATUT_LABELS, value);
}

export function statutPieceLabel(value: string | null | undefined): string {
  return lookup(PIECE_STATUT_LABELS, value);
}

export function criticiteLabel(value: string | null | undefined): string {
  const v = value != null ? String(value).trim() : '';
  if (!v) return '—';
  if (v === 'Elevee' || v === 'Élevée') return 'Élevée';
  return v;
}

export function vigilanceLabel(value: string | null | undefined): string {
  const v = value != null ? String(value).trim() : '';
  if (!v) return '—';
  if (v === 'Renforcee' || v === 'Renforcée') return 'Renforcée';
  if (v === 'Standard') return 'Standard';
  return v;
}
