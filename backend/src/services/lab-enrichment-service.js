import axios from 'axios';
import { getDossierLab } from './labService.js';
import { getMsHttpsAgent } from '../utils/msHttpsAgent.js';

const HTTP_TIMEOUT_MS = 12_000;

function axiosConfig(extra = {}) {
  const agent = getMsHttpsAgent();
  return {
    timeout: HTTP_TIMEOUT_MS,
    ...(agent ? { httpsAgent: agent, proxy: false } : {}),
    ...extra,
  };
}

const SOURCE_LABELS = {
  BDD: 'BDD',
  RECHERCHE_ENTREPRISES: 'Recherche Entreprises',
  INSEE: 'INSEE',
  INPI_RNE: 'INPI / RNE',
  BODACC: 'BODACC',
  RNA: 'RNA',
};

/** @type {{ token: string|null, expiresAt: number }} */
const inpiTokenCache = { token: null, expiresAt: 0 };

const ENRICHABLE_FIELDS = [
  'siren',
  'siret',
  'raison_sociale',
  'forme_societe',
  'rcs',
  'ape',
  'activite',
  'nature',
  'tvaintracom',
  'montant_capital_social',
  'adr1_siege',
  'adr2_siege',
  'cpos_siege',
  'ville_siege',
  'pays_siege',
  'taille_entreprise',
  'zone_geographique_activite',
  'volume_affaires_fourchette',
  'kyc.pays_implantation',
  'kyc.secteurs_text',
];

function cleanText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function digitsOnly(value) {
  return cleanText(value).replace(/\D/g, '');
}

function normalizeSirenSiret({ siret, siren }) {
  const siretDigits = digitsOnly(siret);
  const sirenDigits = digitsOnly(siren);
  const resolvedSiret = siretDigits.length === 14 ? siretDigits : '';
  const resolvedSiren = sirenDigits.length === 9
    ? sirenDigits
    : (resolvedSiret.length >= 9 ? resolvedSiret.slice(0, 9) : '');
  return { siren: resolvedSiren, siret: resolvedSiret };
}

function normalizeCompareValue(value) {
  const s = cleanText(value).toLowerCase();
  if (!s) return '';
  const digits = digitsOnly(s);
  if (digits.length >= 9 && digits.length === s.replace(/[\s.-]/g, '').length) {
    return digits;
  }
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function valuesMatch(a, b) {
  const na = normalizeCompareValue(a);
  const nb = normalizeCompareValue(b);
  if (!na && !nb) return true;
  return na === nb;
}

function mapTrancheEffectif(code) {
  const map = {
    '00': 'NN',
    '01': 'TPE',
    '02': 'TPE',
    '03': 'PME',
    '11': 'PME',
    '12': 'PME',
    '21': 'PME',
    '22': 'PME',
    '31': 'PME',
    '32': 'PME',
    '41': 'PME',
    '42': 'ETI',
    '51': 'ETI',
    '52': 'GE',
    '53': 'GE',
  };
  return map[cleanText(code)] || '';
}

function mapNatureJuridique(code) {
  const c = cleanText(code);
  const map = {
    '5710': 'SAS',
    '5499': 'SARL',
    '5599': 'SA',
    '6540': 'SCI',
    '5202': 'SNC',
    '1000': 'EI',
    '5720': 'SASU',
    '5498': 'EURL',
  };
  if (map[c]) return map[c];
  if (/^57/.test(c)) return 'SAS';
  if (/^54/.test(c)) return 'SARL';
  if (/^55/.test(c)) return 'SA';
  return '';
}

function setNestedValue(target, path, value) {
  const parts = path.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function addApiField(bucket, field, value, source, fetchedAt) {
  const v = cleanText(value);
  if (!v) return;
  if (!bucket[field]) bucket[field] = [];
  bucket[field].push({ value: v, source, fetchedAt });
}

function pickApiValue(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const priority = ['INPI_RNE', 'INSEE', 'RECHERCHE_ENTREPRISES', 'RNA', 'BODACC'];
  const sorted = [...candidates].sort((a, b) => {
    const ia = priority.indexOf(a.source);
    const ib = priority.indexOf(b.source);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return sorted[0];
}

function mergeFields(bddFlat, apiFlat, fetchedAt) {
  /** @type {Record<string, any>} */
  const fields = {};
  /** @type {Record<string, any>} */
  const merged = {};

  for (const field of ENRICHABLE_FIELDS) {
    const bddValue = cleanText(getNestedValue(bddFlat, field));
    const apiCandidate = pickApiValue(apiFlat[field]);
    const apiValue = cleanText(apiCandidate?.value);
    const apiSource = apiCandidate?.source ?? null;
    const apiFetchedAt = apiCandidate?.fetchedAt ?? fetchedAt;

    let status = 'empty';
    let value = '';
    let source = null;
    let fieldFetchedAt = null;

    if (!bddValue && !apiValue) {
      status = 'empty';
      value = '';
    } else if (!bddValue && apiValue) {
      status = 'prefilled';
      value = apiValue;
      source = apiSource;
      fieldFetchedAt = apiFetchedAt;
    } else if (bddValue && !apiValue) {
      status = 'bdd';
      value = bddValue;
      source = 'BDD';
    } else if (valuesMatch(bddValue, apiValue)) {
      status = 'bdd';
      value = bddValue;
      source = 'BDD';
      fieldFetchedAt = apiFetchedAt;
    } else {
      status = 'divergence';
      value = bddValue;
      source = 'BDD';
      fieldFetchedAt = apiFetchedAt;
    }

    fields[field] = {
      value,
      source,
      sourceLabel: source ? (SOURCE_LABELS[source] ?? source) : null,
      fetchedAt: fieldFetchedAt,
      status,
      bddValue: bddValue || null,
      apiValue: apiValue || null,
      apiSource: apiSource || null,
      apiSourceLabel: apiSource ? (SOURCE_LABELS[apiSource] ?? apiSource) : null,
    };

    setNestedValue(merged, field, value);
  }

  return { fields, merged };
}

function extractBddFlatFromDossier(dossier) {
  const client = dossier?.client ?? {};
  const kyc = dossier?.kyc ?? {};
  const siret = cleanText(client.siret);
  return {
    siren: siret.length >= 9 ? siret.slice(0, 9) : '',
    siret,
    raison_sociale: cleanText(client.raison_sociale),
    forme_societe: cleanText(client.forme_societe),
    rcs: cleanText(client.rcs),
    ape: cleanText(client.ape),
    activite: cleanText(client.activite),
    nature: cleanText(client.nature),
    tvaintracom: cleanText(client.tvaintracom),
    montant_capital_social: client.montant_capital_social != null
      ? String(client.montant_capital_social)
      : '',
    adr1_siege: cleanText(client.adr1_siege),
    adr2_siege: cleanText(client.adr2_siege),
    cpos_siege: cleanText(client.cpos_siege),
    ville_siege: cleanText(client.ville_siege),
    pays_siege: '',
    taille_entreprise: '',
    zone_geographique_activite: cleanText(kyc.pays_implantation),
    volume_affaires_fourchette: '',
    kyc: {
      pays_implantation: cleanText(kyc.pays_implantation),
      secteurs_text: Array.isArray(kyc.secteurs) ? kyc.secteurs.join('\n') : '',
    },
  };
}

async function fetchRechercheEntreprises(siren, siret) {
  const fetchedAt = new Date().toISOString();
  const q = siret || siren;
  if (!q) {
    return { ok: false, error: 'SIREN/SIRET requis', fields: {}, fetchedAt };
  }

  try {
    const { data } = await axios.get('https://recherche-entreprises.api.gouv.fr/search', axiosConfig({
      params: { q, per_page: 1, page: 1 },
      headers: { Accept: 'application/json' },
    }));

    const result = data?.results?.[0];
    if (!result) {
      return { ok: false, error: 'Aucun résultat Recherche Entreprises', fields: {}, fetchedAt };
    }

    const siege = result.siege ?? {};
    const fields = {};

    addApiField(fields, 'siren', result.siren, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'siret', siege.siret || result.siret, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'raison_sociale', result.nom_complet || result.nom_raison_sociale || result.denomination, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'forme_societe', mapNatureJuridique(result.nature_juridique) || result.libelle_nature_juridique, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'ape', result.activite_principale, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'activite', result.libelle_activite_principale || result.activite_principale, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'rcs', result.numero_rcs || result.rcs, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'adr1_siege', siege.adresse || siege.geo_adresse, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'cpos_siege', siege.code_postal, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'ville_siege', siege.libelle_commune || siege.commune, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'pays_siege', siege.libelle_pays || siege.pays || 'France', 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'taille_entreprise', mapTrancheEffectif(result.tranche_effectif_salarie), 'RECHERCHE_ENTREPRISES', fetchedAt);

    const zone = [siege.departement, siege.region].filter(Boolean).join(' — ');
    addApiField(fields, 'zone_geographique_activite', zone || siege.libelle_commune, 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'kyc.pays_implantation', siege.libelle_pays || 'France', 'RECHERCHE_ENTREPRISES', fetchedAt);
    addApiField(fields, 'kyc.secteurs_text', result.libelle_activite_principale || result.activite_principale, 'RECHERCHE_ENTREPRISES', fetchedAt);

    const estAssociation = result.complements?.est_association === true;
    return {
      ok: true,
      fetchedAt,
      fields,
      estAssociation,
      dirigeants: Array.isArray(result.dirigeants) ? result.dirigeants : [],
      raw: {
        etat_administratif: result.etat_administratif,
        date_creation: result.date_creation,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.response?.data?.message || err?.message || 'Erreur Recherche Entreprises',
      fields: {},
      fetchedAt,
    };
  }
}

async function fetchSirene(siren) {
  const fetchedAt = new Date().toISOString();
  const token = process.env.INSEE_SIRENE_API_KEY || process.env.SIRENE_API_KEY;
  if (!token) {
    return { ok: false, skipped: true, reason: 'INSEE_SIRENE_API_KEY non configurée', fields: {}, fetchedAt };
  }
  if (!siren) {
    return { ok: false, error: 'SIREN requis', fields: {}, fetchedAt };
  }

  try {
    const { data } = await axios.get(
      `https://api.insee.fr/entreprises/sirene/V3.11/siren/${siren}`,
      axiosConfig({
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }),
    );

    const ul = data?.uniteLegale ?? data?.uniteLegaleUniteLegale ?? {};
    const periode = Array.isArray(ul.periodesUniteLegale)
      ? ul.periodesUniteLegale[ul.periodesUniteLegale.length - 1]
      : ul;
    const fields = {};

    addApiField(fields, 'siren', ul.siren || siren, 'INSEE', fetchedAt);
    addApiField(fields, 'raison_sociale', periode.denominationUniteLegale || periode.nomUniteLegale, 'INSEE', fetchedAt);
    addApiField(fields, 'forme_societe', mapNatureJuridique(periode.categorieJuridiqueUniteLegale) || periode.categorieJuridiqueUniteLegale, 'INSEE', fetchedAt);
    addApiField(fields, 'ape', periode.activitePrincipaleUniteLegale, 'INSEE', fetchedAt);
    addApiField(fields, 'activite', periode.activitePrincipaleUniteLegale, 'INSEE', fetchedAt);

    return { ok: true, fetchedAt, fields };
  } catch (err) {
    return {
      ok: false,
      error: err?.response?.data?.header?.message || err?.message || 'Erreur API Sirene',
      fields: {},
      fetchedAt,
    };
  }
}

async function getInpiToken() {
  const username = process.env.LAB_INPI_RNE_USERNAME || process.env.INPI_RNE_USERNAME;
  const password = process.env.LAB_INPI_RNE_PASSWORD || process.env.INPI_RNE_PASSWORD;
  if (!username || !password) {
    return { token: null, skipped: true, reason: 'LAB_INPI_RNE_USERNAME/PASSWORD non configurés' };
  }

  const now = Date.now();
  if (inpiTokenCache.token && inpiTokenCache.expiresAt > now) {
    return { token: inpiTokenCache.token };
  }

  const baseUrl = process.env.LAB_INPI_RNE_BASE_URL || 'https://registre-national-entreprises.inpi.fr';
  const { data } = await axios.post(
    `${baseUrl}/api/sso/login`,
    { username, password },
    axiosConfig({ headers: { 'Content-Type': 'application/json' } }),
  );

  const token = data?.token;
  if (!token) {
    throw new Error('Token INPI absent dans la réponse');
  }

  inpiTokenCache.token = token;
  inpiTokenCache.expiresAt = now + 50 * 60 * 1000;
  return { token };
}

async function fetchRne(siren) {
  const fetchedAt = new Date().toISOString();
  if (!siren) {
    return { ok: false, error: 'SIREN requis', fields: {}, fetchedAt };
  }

  try {
    const auth = await getInpiToken();
    if (!auth.token) {
      return { ok: false, skipped: true, reason: auth.reason, fields: {}, fetchedAt };
    }

    const baseUrl = process.env.LAB_INPI_RNE_BASE_URL || 'https://registre-national-entreprises.inpi.fr';
    const { data } = await axios.get(`${baseUrl}/api/companies/${siren}`, axiosConfig({
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
    }));

    const fields = {};
    const formality = data?.formality?.content ?? data?.formality ?? data ?? {};
    const company = formality.personneMorale || formality.entreprise || formality;
    const identite = company?.identite || company?.descriptionPersonneMorale || company;
    const adresse = company?.adresseEntreprise || company?.adresse || formality?.adresseEntreprise;

    addApiField(fields, 'siren', siren, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'raison_sociale', identite?.denomination || identite?.nomCommercial || data?.denomination, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'forme_societe', identite?.formeJuridique || identite?.formeSociale, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'montant_capital_social', identite?.montantCapital ?? company?.montantCapital, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'ape', identite?.codeApe || company?.codeApe, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'adr1_siege', adresse?.voie || adresse?.adresseVoie, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'cpos_siege', adresse?.codePostal, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'ville_siege', adresse?.commune || adresse?.ville, 'INPI_RNE', fetchedAt);
    addApiField(fields, 'pays_siege', adresse?.pays || 'France', 'INPI_RNE', fetchedAt);

    const dirigeants = [];
    const pouvoirs = company?.composition?.pouvoirs || company?.pouvoirs || [];
    if (Array.isArray(pouvoirs)) {
      for (const p of pouvoirs) {
        const ind = p?.individu?.descriptionPersonne || p?.individu || p?.representant;
        if (!ind) continue;
        dirigeants.push({
          nom: cleanText(ind.nom || ind.nomUsage),
          prenom: cleanText(ind.prenom || ind.prenoms),
          qualite: cleanText(p?.roleEntreprise || p?.qualite),
        });
      }
    }

    return { ok: true, fetchedAt, fields, dirigeants };
  } catch (err) {
    return {
      ok: false,
      error: err?.response?.data?.message || err?.message || 'Erreur API RNE INPI',
      fields: {},
      fetchedAt,
    };
  }
}

function buildBodaccLien(siren, record) {
  const r = record ?? {};
  const parution = cleanText(r.numeroparution || r.numeroParution);
  const annonce = cleanText(r.numeroannonce || r.numeroAnnonce);
  if (parution && annonce) {
    return `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${parution}${annonce}`;
  }
  if (siren) {
    return `https://www.bodacc.fr/pages/annonces-commerciales/?q.registre=${encodeURIComponent(siren)}`;
  }
  return 'https://www.bodacc.fr/pages/annonces-commerciales/';
}

function mapBodaccGuidance(famille, type) {
  const f = cleanText(famille).toLowerCase();
  const t = cleanText(type).toLowerCase();

  if (f.includes('collective') || f.includes('procedure')) {
    return {
      gravite: 'elevee',
      familleLabel: 'Procédure collective',
      actionGuide: 'Vérifier le stade de la procédure (safeguard, redressement, liquidation). Réévaluer le niveau de risque LAB et documenter la décision de poursuite ou de fin de relation.',
      etapeWizard: 'lab',
      etapeLabel: 'Dossier LAB & risque',
      typeEvenementLab: 'CHANGEMENT_RISQUE',
      diligenceSuggeree: 'Analyser la procédure collective et consigner la décision (maintien / renforcement / fin de relation).',
      masquerParDefaut: false,
    };
  }

  if (f.includes('radiation') || f.includes('retablissement_professionnel')) {
    return {
      gravite: 'elevee',
      familleLabel: 'Radiation / retrait du registre',
      actionGuide: 'Confirmer si la société est toujours en relation avec le cabinet. Mettre à jour le statut dossier et les pièces KYC si la relation se poursuit.',
      etapeWizard: 'identite',
      etapeLabel: 'Identité juridique',
      typeEvenementLab: 'CHANGEMENT_KYC',
      diligenceSuggeree: 'Obtenir un extrait Kbis récent ou justifier la fin de relation.',
      masquerParDefaut: false,
    };
  }

  if (f.includes('vente') || f.includes('cession')) {
    return {
      gravite: 'moyenne',
      familleLabel: 'Vente / cession',
      actionGuide: 'Vérifier si l’activité, l’identité économique ou la structure du client a changé. Adapter le profil KYC et le risque si nécessaire.',
      etapeWizard: 'kyc',
      etapeLabel: 'KYC structuré',
      typeEvenementLab: 'CHANGEMENT_KYC',
      diligenceSuggeree: 'Comparer l’activité déclarée avec l’annonce et mettre à jour le dossier.',
      masquerParDefaut: false,
    };
  }

  if (f.includes('modification') || f.includes('changement')) {
    return {
      gravite: 'moyenne',
      familleLabel: 'Modification statutaire',
      actionGuide: 'Comparer raison sociale, forme juridique, capital, dirigeants et siège avec le dossier. Mettre à jour les champs en écart et les pièces KYC.',
      etapeWizard: 'identite',
      etapeLabel: 'Identité juridique',
      typeEvenementLab: 'CHANGEMENT_KYC',
      diligenceSuggeree: 'Demander KBIS / statuts à jour si les informations diffèrent du dossier.',
      masquerParDefaut: false,
    };
  }

  if (f.includes('dpc') || f.includes('depot') || t.includes('compte')) {
    return {
      gravite: 'faible',
      familleLabel: 'Dépôt des comptes',
      actionGuide: 'Contrôle de routine : vérifier que les comptes annuels sont bien reçus et archivés au dossier comptable.',
      etapeWizard: 'pieces',
      etapeLabel: 'Pièces KYC',
      typeEvenementLab: null,
      diligenceSuggeree: 'Archiver les comptes annuels au dossier si ce n’est pas déjà fait.',
      masquerParDefaut: true,
    };
  }

  if (f.includes('creation') || f.includes('immatriculation')) {
    return {
      gravite: 'faible',
      familleLabel: 'Création / immatriculation',
      actionGuide: 'Vérifier la cohérence des identifiants légaux si le client est récent ou en entrée en relation.',
      etapeWizard: 'identifiants',
      etapeLabel: 'Identifiants',
      typeEvenementLab: 'ENTREE_RELATION',
      diligenceSuggeree: 'Contrôler SIREN/SIRET et pièces d’immatriculation.',
      masquerParDefaut: true,
    };
  }

  return {
    gravite: 'moyenne',
    familleLabel: famille ? String(famille) : 'Annonce légale',
    actionGuide: 'Lire l’annonce sur BODACC, comparer avec le dossier client et décider si une mise à jour KYC ou LAB est nécessaire.',
    etapeWizard: 'kyc',
    etapeLabel: 'KYC structuré',
    typeEvenementLab: 'AUTRE',
    diligenceSuggeree: 'Documenter l’analyse de l’annonce dans la revue annuelle.',
    masquerParDefaut: false,
  };
}

function bodaccItemId(record, index) {
  const r = record ?? {};
  const explicit = cleanText(r.id);
  if (explicit) return explicit;
  return [
    cleanText(r.dateparution || r.dateParution),
    cleanText(r.familleavis || r.familleAvis),
    cleanText(r.numeroannonce || r.numeroAnnonce),
    index,
  ].filter(Boolean).join('-');
}

async function fetchBodacc(siren) {
  const fetchedAt = new Date().toISOString();
  if (!siren) {
    return { ok: false, error: 'SIREN requis', alertes: [], fetchedAt };
  }

  try {
    const { data } = await axios.get(
      'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records',
      axiosConfig({
        params: {
          where: `registre like "${siren}"`,
          order_by: 'dateparution desc',
          limit: 15,
        },
        headers: { Accept: 'application/json' },
      }),
    );

    const records = data?.results ?? [];
    const alertes = records.map((row, index) => {
      const r = row ?? {};
      const famille = r.familleavis || r.familleAvis || null;
      const type = r.typeavis || r.typeAvis || null;
      const guidance = mapBodaccGuidance(famille, type);
      return {
        id: bodaccItemId(r, index),
        date: r.dateparution || r.dateParution || null,
        famille,
        type,
        tribunal: r.tribunal || null,
        resume: cleanText(r.publicationavis || r.publicationAvis || r.nomcommercial || r.nomCommercial),
        source: 'BODACC',
        fetchedAt,
        lienBodacc: buildBodaccLien(siren, r),
        ...guidance,
      };
    });

    const procedures = alertes.filter((a) => /collective/i.test(cleanText(a.famille)));
    return { ok: true, fetchedAt, alertes, proceduresCollectives: procedures.length };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Erreur API BODACC',
      alertes: [],
      fetchedAt,
    };
  }
}

async function fetchRna(siren) {
  const fetchedAt = new Date().toISOString();
  if (!siren) {
    return { ok: false, error: 'SIREN requis', fields: {}, fetchedAt };
  }

  try {
    const { data } = await axios.get('https://recherche-entreprises.api.gouv.fr/search', axiosConfig({
      params: { q: siren, per_page: 1 },
    }));
    const result = data?.results?.[0];
    if (!result?.complements?.est_association) {
      return { ok: false, skipped: true, reason: 'Non association', fields: {}, fetchedAt };
    }

    const fields = {};
    const comp = result.complements ?? {};
    addApiField(fields, 'raison_sociale', result.nom_complet, 'RNA', fetchedAt);
    addApiField(fields, 'nature', comp.objet || comp.objet_social, 'RNA', fetchedAt);
    addApiField(fields, 'activite', comp.objet || comp.objet_social, 'RNA', fetchedAt);

    return { ok: true, fetchedAt, fields, rnaId: comp.identifiant_association || comp.id_association };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Erreur RNA',
      fields: {},
      fetchedAt,
    };
  }
}

function mergeApiFieldMaps(...maps) {
  const out = {};
  for (const map of maps) {
    for (const [field, entries] of Object.entries(map ?? {})) {
      if (!out[field]) out[field] = [];
      out[field].push(...entries);
    }
  }
  return out;
}

/**
 * Enrichissement dossier LAB depuis registres publics + fusion avec BDD.
 * @param {{ siret?: string, siren?: string, code_client?: string }} params
 */
export async function getLabEnrichissement(params = {}) {
  const { siren, siret } = normalizeSirenSiret(params);
  const codeClient = cleanText(params.code_client);
  const fetchedAt = new Date().toISOString();

  if (!siren && !siret) {
    return {
      ok: false,
      error: 'SIREN ou SIRET requis (9 ou 14 chiffres)',
      fetchedAt,
      fields: {},
      merged: {},
      sources: {},
      alertesBodacc: [],
    };
  }

  const [recherche, sirene, rne, bodacc] = await Promise.all([
    fetchRechercheEntreprises(siren, siret),
    fetchSirene(siren),
    fetchRne(siren),
    fetchBodacc(siren),
  ]);

  let rna = { ok: false, skipped: true, fields: {}, fetchedAt };
  if (recherche.estAssociation) {
    rna = await fetchRna(siren);
  }

  const apiFlat = mergeApiFieldMaps(
    recherche.fields,
    sirene.fields,
    rne.fields,
    rna.fields,
  );

  let bddFlat = {};
  if (codeClient) {
    const dossier = await getDossierLab(codeClient);
    if (dossier?.client) {
      bddFlat = extractBddFlatFromDossier(dossier);
    }
  }

  const { fields, merged } = mergeFields(bddFlat, apiFlat, fetchedAt);

  const divergences = Object.entries(fields)
    .filter(([, meta]) => meta.status === 'divergence')
    .map(([field, meta]) => ({ field, ...meta }));

  return {
    ok: true,
    fetchedAt,
    siren,
    siret: siret || getNestedValue(merged, 'siret') || '',
    fields,
    merged,
    divergences,
    alertesBodacc: bodacc.alertes ?? [],
    dirigeants: [
      ...(Array.isArray(recherche.dirigeants) ? recherche.dirigeants : []),
      ...(Array.isArray(rne.dirigeants) ? rne.dirigeants : []),
    ],
    sources: {
      rechercheEntreprises: {
        ok: recherche.ok,
        error: recherche.error ?? null,
        fetchedAt: recherche.fetchedAt,
      },
      sirene: {
        ok: sirene.ok,
        skipped: sirene.skipped ?? false,
        error: sirene.error ?? sirene.reason ?? null,
        fetchedAt: sirene.fetchedAt,
      },
      rne: {
        ok: rne.ok,
        skipped: rne.skipped ?? false,
        error: rne.error ?? rne.reason ?? null,
        fetchedAt: rne.fetchedAt,
      },
      bodacc: {
        ok: bodacc.ok,
        error: bodacc.error ?? null,
        fetchedAt: bodacc.fetchedAt,
        proceduresCollectives: bodacc.proceduresCollectives ?? 0,
      },
      rna: {
        ok: rna.ok,
        skipped: rna.skipped ?? false,
        error: rna.error ?? rna.reason ?? null,
        fetchedAt: rna.fetchedAt,
      },
    },
  };
}

/** @param {string} siren */
export async function fetchBodaccAlertes(siren) {
  return fetchBodacc(siren);
}

/**
 * Compte les annonces BODACC critiques encore « à traiter » selon l'état checklist.
 * @param {Array<{ id?: string, gravite?: string }>} alertes
 * @param {Record<string, { statut?: string }>} checklistState
 */
export function countPendingCriticalBodacc(alertes, checklistState) {
  const checklist = checklistState && typeof checklistState === 'object' ? checklistState : {};
  let pending = 0;
  for (const alerte of alertes || []) {
    if (cleanText(alerte.gravite) !== 'elevee') continue;
    const entry = checklist[alerte.id];
    const statut = entry && typeof entry === 'object' ? cleanText(entry.statut) : 'a_traiter';
    if (statut !== 'traite' && statut !== 'sans_suite') {
      pending += 1;
    }
  }
  return pending;
}
