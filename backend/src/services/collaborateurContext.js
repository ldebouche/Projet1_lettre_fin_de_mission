import dbService from './dbService.js';
import { getUserGroupsByOid } from './graphService.js';

/** Cartographie + modulation cabinet. COPIL substitue Resplab tant que le groupe n'existe pas. */
export const GROUPS_CARTOGRAPHIE = new Set(['admin', 'informatique', 'copil']);

/** TRACFIN / jobs LAB — inchangé (chantier ultérieur). */
export const GROUPS_TRACFIN = new Set(['admin', 'informatique', 'lab']);

const PREFIX = 'gr-users-chatbot-';

export function normalizeGroupName(name) {
  if (name == null) return '';
  let value = String(name).trim().toLowerCase();
  if (value.startsWith(PREFIX)) {
    value = value.slice(PREFIX.length);
  }
  return value;
}

export function normalizeGroupes(groupes) {
  return (Array.isArray(groupes) ? groupes : [])
    .map(normalizeGroupName)
    .filter(Boolean);
}

/**
 * Collaborateur BDD + groupes Azure de l'appelant (même source que VerifCollaborateur).
 */
export async function resolveCollaborateurContext(req) {
  const email = req.user?.unique_name;
  let collaborateur = null;
  if (email) {
    collaborateur = await dbService.GetCollaborateur(email);
  }

  const rawId = collaborateur?.id_sellsy != null ? String(collaborateur.id_sellsy).trim() : '';
  const idSellsy = rawId === '' ? null : rawId;
  const statut = collaborateur?.statut != null ? String(collaborateur.statut).trim().toUpperCase() : '';

  let groupes = [];
  if (process.env.DEMO_AUTH === 'true' && Array.isArray(req.user?.roles)) {
    groupes = req.user.roles;
  } else if (req.user?.oid) {
    try {
      groupes = await getUserGroupsByOid(req.user.oid);
    } catch (err) {
      console.error('resolveCollaborateurContext: échec getUserGroupsByOid', err);
      groupes = [];
    }
  }

  const normalized = normalizeGroupes(groupes);
  const canAccessCartographie = normalized.some((g) => GROUPS_CARTOGRAPHIE.has(g));
  const canAccessTracfin = normalized.some((g) => GROUPS_TRACFIN.has(g));
  const canSeeAllDossiers = normalized.includes('informatique');
  const canSeeAllProspects = canAccessCartographie;
  const isEc = statut === 'EC';
  const canSeeProspects = canSeeAllProspects || isEc;

  return {
    collaborateur,
    idSellsy,
    statut,
    groupes: normalized,
    canAccessCartographie,
    canAccessTracfin,
    canSeeAllDossiers,
    canSeeAllProspects,
    canSeeProspects,
  };
}
