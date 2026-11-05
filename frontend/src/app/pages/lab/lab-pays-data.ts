/**
 * Référentiels pays LAB (hors BDD).
 * - PAYS_ISO : liste déroulante générale (siège, résidence, implantation).
 * - PAYS_RISQUE_D3 : listes trame LBC-FT 2027-2029 (onglet Référentiels, état 19/06/2026).
 * Vanuatu : présent D3-1 et D3-2 ; le libellé D3-2 exclut D3-1 → on le garde en D3-1 uniquement ici.
 */

export type LabPaysOption = { code: string; libelle: string; liste?: string };

/** Pays usuels + ISO, libellés FR — France en tête. */
export const LAB_PAYS_ISO: LabPaysOption[] = [
  { code: 'FR', libelle: 'France' },
  { code: 'BE', libelle: 'Belgique' },
  { code: 'CH', libelle: 'Suisse' },
  { code: 'LU', libelle: 'Luxembourg' },
  { code: 'DE', libelle: 'Allemagne' },
  { code: 'ES', libelle: 'Espagne' },
  { code: 'IT', libelle: 'Italie' },
  { code: 'PT', libelle: 'Portugal' },
  { code: 'GB', libelle: 'Royaume-Uni' },
  { code: 'IE', libelle: 'Irlande' },
  { code: 'NL', libelle: 'Pays-Bas' },
  { code: 'MC', libelle: 'Monaco' },
  { code: 'AD', libelle: 'Andorre' },
  { code: 'US', libelle: 'États-Unis' },
  { code: 'CA', libelle: 'Canada' },
  { code: 'MA', libelle: 'Maroc' },
  { code: 'DZ', libelle: 'Algérie' },
  { code: 'TN', libelle: 'Tunisie' },
  { code: 'SN', libelle: 'Sénégal' },
  { code: 'CI', libelle: "Côte d'Ivoire" },
  { code: 'CM', libelle: 'Cameroun' },
  { code: 'CN', libelle: 'Chine' },
  { code: 'HK', libelle: 'Hong Kong' },
  { code: 'SG', libelle: 'Singapour' },
  { code: 'AE', libelle: 'Émirats arabes unis' },
  { code: 'SA', libelle: 'Arabie saoudite' },
  { code: 'IL', libelle: 'Israël' },
  { code: 'TR', libelle: 'Turquie' },
  { code: 'BR', libelle: 'Brésil' },
  { code: 'MX', libelle: 'Mexique' },
  { code: 'AR', libelle: 'Argentine' },
  { code: 'AU', libelle: 'Australie' },
  { code: 'JP', libelle: 'Japon' },
  { code: 'IN', libelle: 'Inde' },
  { code: 'RU', libelle: 'Russie' },
  { code: 'UA', libelle: 'Ukraine' },
  { code: 'BY', libelle: 'Biélorussie' },
  { code: 'PL', libelle: 'Pologne' },
  { code: 'RO', libelle: 'Roumanie' },
  { code: 'BG', libelle: 'Bulgarie' },
  { code: 'GR', libelle: 'Grèce' },
  { code: 'SE', libelle: 'Suède' },
  { code: 'NO', libelle: 'Norvège' },
  { code: 'DK', libelle: 'Danemark' },
  { code: 'FI', libelle: 'Finlande' },
  { code: 'AT', libelle: 'Autriche' },
  { code: 'CZ', libelle: 'Tchéquie' },
  { code: 'HU', libelle: 'Hongrie' },
  { code: 'HR', libelle: 'Croatie' },
  { code: 'RS', libelle: 'Serbie' },
  { code: 'XX', libelle: 'Autre (préciser en notes)' },
];

/** Liste D3-1 (GAFI / UE haut risque) — Vanuatu compté ici seulement. */
const D3_1: LabPaysOption[] = [
  { code: 'AF', libelle: 'Afghanistan', liste: 'PAYS_D3-1' },
  { code: 'ZA', libelle: 'Afrique du Sud', liste: 'PAYS_D3-1' },
  { code: 'DZ', libelle: 'Algérie', liste: 'PAYS_D3-1' },
  { code: 'AO', libelle: 'Angola', liste: 'PAYS_D3-1' },
  { code: 'BO', libelle: 'Bolivie', liste: 'PAYS_D3-1' },
  { code: 'BA', libelle: 'Bosnie-Herzégovine', liste: 'PAYS_D3-1' },
  { code: 'BG', libelle: 'Bulgarie', liste: 'PAYS_D3-1' },
  { code: 'BF', libelle: 'Burkina Faso', liste: 'PAYS_D3-1' },
  { code: 'CM', libelle: 'Cameroun', liste: 'PAYS_D3-1' },
  { code: 'KP', libelle: 'Corée du Nord', liste: 'PAYS_D3-1' },
  { code: 'CI', libelle: "Côte d'Ivoire", liste: 'PAYS_D3-1' },
  { code: 'HT', libelle: 'Haïti', liste: 'PAYS_D3-1' },
  { code: 'VG', libelle: 'Îles Vierges britanniques', liste: 'PAYS_D3-1' },
  { code: 'IQ', libelle: 'Irak', liste: 'PAYS_D3-1' },
  { code: 'IR', libelle: 'Iran', liste: 'PAYS_D3-1' },
  { code: 'KE', libelle: 'Kenya', liste: 'PAYS_D3-1' },
  { code: 'KW', libelle: 'Koweït', liste: 'PAYS_D3-1' },
  { code: 'LA', libelle: 'Laos', liste: 'PAYS_D3-1' },
  { code: 'LB', libelle: 'Liban', liste: 'PAYS_D3-1' },
  { code: 'ML', libelle: 'Mali', liste: 'PAYS_D3-1' },
  { code: 'MC', libelle: 'Monaco', liste: 'PAYS_D3-1' },
  { code: 'MZ', libelle: 'Mozambique', liste: 'PAYS_D3-1' },
  { code: 'MM', libelle: 'Myanmar', liste: 'PAYS_D3-1' },
  { code: 'NA', libelle: 'Namibie', liste: 'PAYS_D3-1' },
  { code: 'NP', libelle: 'Népal', liste: 'PAYS_D3-1' },
  { code: 'NG', libelle: 'Nigeria', liste: 'PAYS_D3-1' },
  { code: 'PG', libelle: 'Papouasie-Nouvelle-Guinée', liste: 'PAYS_D3-1' },
  { code: 'CD', libelle: 'République démocratique du Congo', liste: 'PAYS_D3-1' },
  { code: 'RU', libelle: 'Russie', liste: 'PAYS_D3-1' },
  { code: 'SS', libelle: 'Soudan du Sud', liste: 'PAYS_D3-1' },
  { code: 'SY', libelle: 'Syrie', liste: 'PAYS_D3-1' },
  { code: 'TZ', libelle: 'Tanzanie', liste: 'PAYS_D3-1' },
  { code: 'TT', libelle: 'Trinité-et-Tobago', liste: 'PAYS_D3-1' },
  { code: 'VU', libelle: 'Vanuatu', liste: 'PAYS_D3-1' },
  { code: 'VE', libelle: 'Venezuela', liste: 'PAYS_D3-1' },
  { code: 'VN', libelle: 'Vietnam', liste: 'PAYS_D3-1' },
  { code: 'YE', libelle: 'Yémen', liste: 'PAYS_D3-1' },
];

/** Liste D3-2 (ETNC FR / liste noire UE), hors pays déjà en D3-1. */
const D3_2: LabPaysOption[] = [
  { code: 'AI', libelle: 'Anguilla', liste: 'PAYS_D3-2' },
  { code: 'AG', libelle: 'Antigua-et-Barbuda', liste: 'PAYS_D3-2' },
  { code: 'GU', libelle: 'Guam', liste: 'PAYS_D3-2' },
  { code: 'TC', libelle: 'Îles Turks-et-Caïcos', liste: 'PAYS_D3-2' },
  { code: 'VI', libelle: 'Îles Vierges américaines', liste: 'PAYS_D3-2' },
  { code: 'PW', libelle: 'Palaos', liste: 'PAYS_D3-2' },
  { code: 'PA', libelle: 'Panama', liste: 'PAYS_D3-2' },
  { code: 'AS', libelle: 'Samoa américaines', liste: 'PAYS_D3-2' },
];

export const LAB_PAYS_RISQUE: LabPaysOption[] = [...D3_1, ...D3_2];

export function normalizePaysKey(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Garantit que la valeur courante apparaît dans les options (anciennes saisies libres). */
export function ensurePaysInOptions(
  options: LabPaysOption[],
  current: string | null | undefined,
): LabPaysOption[] {
  const cur = String(current ?? '').trim();
  if (!cur) return options;
  const key = normalizePaysKey(cur);
  const exists = options.some(
    (o) => normalizePaysKey(o.libelle) === key || normalizePaysKey(o.code) === key,
  );
  if (exists) return options;
  return [...options, { code: '_SAISI', libelle: cur }];
}

export function parsePaysRisqueText(text: string | null | undefined): string[] {
  return String(text ?? '')
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatPaysRisqueText(selected: string[]): string {
  return selected.map((s) => s.trim()).filter(Boolean).join('\n');
}
