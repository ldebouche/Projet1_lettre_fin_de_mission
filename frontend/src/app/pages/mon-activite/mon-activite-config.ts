export type ActiviteKey = 'ventes' | 'clients' | 'production' | 'rentabilite';

export interface ActiviteOption {
  key: ActiviteKey;
  label: string;
}

const URL_VENTES_COPIL_RESPSITES =
  'https://app.powerbi.com/view?r=eyJrIjoiYTRjOTMwMTYtYzc0Zi00YWViLThkOTEtZDEyZmU0NDlkZWVmIiwidCI6ImY3ZjUwNmY3LWM1NTEtNGE4YS04YzVhLWI3ZDMzOTgyOGU0YiJ9';
const URL_VENTES_RESPSOCI =
  'https://app.powerbi.com/view?r=eyJrIjoiZWI5NjlhMjEtOTc2ZC00NTNiLWExNDMtZThkM2I4YzU3ZmM0IiwidCI6ImY3ZjUwNmY3LWM1NTEtNGE4YS04YzVhLWI3ZDMzOTgyOGU0YiJ9';
const URL_VENTES_RESPJURI =
  'https://app.powerbi.com/view?r=eyJrIjoiYzI5M2M1OWQtMzNmOS00OWZmLWE5YzAtNDBjODMwMzg4ZGVhIiwidCI6ImY3ZjUwNmY3LWM1NTEtNGE4YS04YzVhLWI3ZDMzOTgyOGU0YiJ9';
const URL_CLIENTS =
  'https://app.powerbi.com/view?r=eyJrIjoiMDAxNGVmYmItZTgxZS00YzRhLWJhODgtMWQ3ZGVjNjYwNWE1IiwidCI6ImY3ZjUwNmY3LWM1NTEtNGE4YS04YzVhLWI3ZDMzOTgyOGU0YiJ9';
const URL_PRODUCTION =
  'https://app.powerbi.com/view?r=eyJrIjoiNzVmZTUxNWQtMjA3ZC00NDQ4LTkxYTYtYzg5ZWUwNGI2OWY2IiwidCI6ImY3ZjUwNmY3LWM1NTEtNGE4YS04YzVhLWI3ZDMzOTgyOGU0YiJ9';
const URL_RENTABILITE =
  'https://app.powerbi.com/view?r=eyJrIjoiY2NmNTZjOGYtZTY5Yy00MzJiLWFjYjEtNGRjZTM1ZDJmZTFjIiwidCI6ImY3ZjUwNmY3LWM1NTEtNGE4YS04YzVhLWI3ZDMzOTgyOGU0YiJ9';

const LABELS: Record<ActiviteKey, string> = {
  ventes: 'Statistiques de ventes',
  clients: 'Statistiques clients',
  production: 'Suivi de production',
  rentabilite: 'Rentabilité',
};

function normalizeGroupes(groupes: string[] | null | undefined): string[] {
  return (groupes || [])
    .map((g) => (g != null ? String(g).trim().toLowerCase() : ''))
    .filter(Boolean);
}

function hasAny(groupes: string[], allowed: string[]): boolean {
  return allowed.some((r) => groupes.includes(r));
}

function resolveVentesUrl(groupes: string[]): string | null {
  // Priorité : Copil / Respsites / Informatique → Respsoci → Respjuri
  if (hasAny(groupes, ['copil', 'respsites', 'informatique'])) {
    return URL_VENTES_COPIL_RESPSITES;
  }
  if (hasAny(groupes, ['respsoci'])) {
    return URL_VENTES_RESPSOCI;
  }
  if (hasAny(groupes, ['respjuri'])) {
    return URL_VENTES_RESPJURI;
  }
  return null;
}

/** Options visibles selon les groupes Microsoft du collaborateur. */
export function getActiviteOptions(groupesMicrosoft: string[] | null | undefined): ActiviteOption[] {
  const groupes = normalizeGroupes(groupesMicrosoft);
  const options: ActiviteOption[] = [];

  if (resolveVentesUrl(groupes)) {
    options.push({ key: 'ventes', label: LABELS.ventes });
  }
  if (hasAny(groupes, ['copil', 'respsites', 'informatique'])) {
    options.push({ key: 'clients', label: LABELS.clients });
    options.push({ key: 'production', label: LABELS.production });
    options.push({ key: 'rentabilite', label: LABELS.rentabilite });
  }

  return options;
}

/** URL Power BI pour une activité, ou null si non autorisé. */
export function getActiviteUrl(
  key: ActiviteKey,
  groupesMicrosoft: string[] | null | undefined
): string | null {
  const groupes = normalizeGroupes(groupesMicrosoft);

  switch (key) {
    case 'ventes':
      return resolveVentesUrl(groupes);
    case 'clients':
      return hasAny(groupes, ['copil', 'respsites', 'informatique']) ? URL_CLIENTS : null;
    case 'production':
      return hasAny(groupes, ['copil', 'respsites', 'informatique']) ? URL_PRODUCTION : null;
    case 'rentabilite':
      return hasAny(groupes, ['copil', 'respsites', 'informatique']) ? URL_RENTABILITE : null;
    default:
      return null;
  }
}

export function getActiviteLabel(key: ActiviteKey): string {
  return LABELS[key] || key;
}

export function isActiviteKey(value: string | null | undefined): value is ActiviteKey {
  return value === 'ventes' || value === 'clients' || value === 'production' || value === 'rentabilite';
}
