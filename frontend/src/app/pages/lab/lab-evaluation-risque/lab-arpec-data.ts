/** Référentiel ARPEC provisoire (frontend) — aligné sur docs/contrat-lab-evaluation-risque-arpec.md et schema-bdd-lab.sql seeds. */

export type ArpecNiveau = 'Faible' | 'Moyen' | 'Élevé';
export type ArpecVigilance = 'Standard' | 'Renforcée';
export type ArpecReponse = 'O' | 'N' | null;

export interface ArpecQuestionDef {
  code: string;
  libelle: string;
  sousAxe?: string;
  estDeclencheur: boolean;
  niveauSiOui: 'Moyen' | 'Élevé';
}

export interface ArpecAxeDef {
  code: string;
  libelle: string;
  questions: ArpecQuestionDef[];
}

export type ArpecModulation = 0 | 1 | -1;

const NIVEAU_RANK: Record<ArpecNiveau, number> = {
  Faible: 0,
  Moyen: 1,
  Élevé: 2,
};

const NIVEAU_BY_RANK: ArpecNiveau[] = ['Faible', 'Moyen', 'Élevé'];

export const ARPEC_AXES_FALLBACK: readonly ArpecAxeDef[] = [
  {
    code: 'D1',
    libelle: 'Caractéristiques du client',
    questions: [
      { code: 'D1-Q01', libelle: 'Association culturelle, cultuelle ou humanitaire recevant ou versant des fonds à l\'étranger ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q02', libelle: 'Association dirigée par un élu (ou un proche) recevant > 25 k€ de subventions publiques de sa collectivité ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q03', libelle: 'Société à prépondérance immobilière détenue via une cascade de véhicules étrangers non régulés ou un fonds d\'investissement alternatif (AIFM) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q04', libelle: 'Société ayant son siège dans une société de domiciliation ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q05', libelle: 'Parti politique ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q06', libelle: 'Client ou bénéficiaire effectif ayant le statut de PPE (personne politiquement exposée) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q07', libelle: 'Société en difficulté susceptible d\'une procédure collective dans les 6 mois ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q08', libelle: 'Groupe utilisant une superposition d\'entités étrangères qui complexifie l\'identification du BE ou de l\'origine des fonds ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q09', libelle: 'Présence d\'une fiducie ou d\'un trust dans le groupe ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q10', libelle: 'Recours à des montages fiscaux complexes (transnationaux ou non) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D1-Q11', libelle: 'Personne physique contrôlant d\'autres sociétés (hors SCI) sans lien juridique mais avec des liens économiques ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
    ],
  },
  {
    code: 'D2',
    libelle: 'Activités du client',
    questions: [
      { code: 'D2-Q01', libelle: 'BTP avec chiffre d\'affaires HT > 500 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q02', libelle: 'Casse automobile ou ferrailleur ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q03', libelle: 'Vente de véhicules d\'occasion (marge > 1/3 de la marge totale) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q04', libelle: 'Changeur manuel ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q05', libelle: 'Import/export ou négoce international de matières premières ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q06', libelle: 'Promotion immobilière > 500 k€ HT ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q07', libelle: 'Marchand de biens immobiliers > 500 k€ HT ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q08', libelle: 'Point de vente Française des Jeux / PMU ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q09', libelle: 'Buraliste (hors FDJ/PMU) avec CA HT > 300 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q10', libelle: 'Établissement de nuit (discothèque, bar…) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q11', libelle: 'Hôtel, café, restaurant avec CA HT > 500 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q12', libelle: 'Commerce de proximité / marché avec CA HT > 500 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q13', libelle: 'Antiquaire, brocanteur ou galerie d\'art ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q14', libelle: 'Bijoutier / métaux précieux / pierres précieuses avec CA HT > 500 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q15', libelle: 'E-commerce vers l\'étranger ou encaissement de créances à l\'étranger ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q16', libelle: 'Prestataire de transmission de fonds en espèces depuis/vers l\'étranger ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q17', libelle: 'Entreprise participant à des transferts dans le sport professionnel ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q18', libelle: 'Négoce de matières premières (hors import/export déjà visé) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q19', libelle: 'Sécurité privée / gardiennage / nettoyage avec CA HT > 500 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q20', libelle: 'Taxi / VTC dont les recettes ne passent pas par une plateforme ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D2-Q21', libelle: 'Agriculture ou transport routier avec recours significatif à la main-d\'œuvre étrangère ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
    ],
  },
  {
    code: 'D3',
    libelle: 'Localisation (client et fonds)',
    questions: [
      { code: 'D3-1-Q01', libelle: 'Client / représentant légal / BE domicilié dans un pays liste GAFI ou liste UE à haut risque ?', sousAxe: 'D3-1', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D3-1-Q02', libelle: 'Établissement, filiale ou société-mère situé dans un de ces pays ?', sousAxe: 'D3-1', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D3-1-Q03', libelle: 'Transferts de fonds depuis ou vers un de ces pays ?', sousAxe: 'D3-1', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D3-2-Q01', libelle: 'Client / représentant légal / BE domicilié dans un pays liste noire UE fiscale ou ETNC France ?', sousAxe: 'D3-2', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D3-2-Q02', libelle: 'Établissement, filiale ou société-mère situé dans un de ces pays ?', sousAxe: 'D3-2', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D3-2-Q03', libelle: 'Transferts de fonds depuis ou vers un de ces pays ?', sousAxe: 'D3-2', estDeclencheur: true, niveauSiOui: 'Élevé' },
    ],
  },
  {
    code: 'D4',
    libelle: 'Nature des missions',
    questions: [
      { code: 'D4-Q01', libelle: 'Création/reprise financée par apports personnels d\'un BE > 50 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q02', libelle: 'Prise de participation financée par apports d\'un investisseur personne physique > 100 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q03', libelle: 'Restructuration juridique/financière avec injection de fonds personnels (> 50 k€ BE ou > 100 k€ investisseur) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q04', libelle: 'Transmission universelle de patrimoine (TUP) transnationale ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q05', libelle: 'Paiement des dettes fournisseurs (mandat de paiement — loi PACTE) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q06', libelle: 'Recouvrement amiable des créances (loi PACTE) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q07', libelle: 'Comptes de campagne électorale ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q08', libelle: 'Conseil ou montages fiscaux > 5 % des honoraires du portefeuille ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q09', libelle: 'Conseil en gestion de patrimoine > 5 % des honoraires ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D4-Q10', libelle: 'Conseil en recherche de financement / gestion de trésorerie > 5 % des honoraires ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
    ],
  },
  {
    code: 'D5',
    libelle: 'Opérations particulières',
    questions: [
      { code: 'D5-Q01', libelle: 'Prêts de non-associés (non-établissements financiers) > 100 k€ ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D5-Q02', libelle: 'Financements à conditions anormales (taux hors marché, sans garantie, prêteur inhabituel) ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D5-Q03', libelle: 'Financements > 100 k€ via crowdfunding ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D5-Q04', libelle: 'Opération en crypto-actif / crypto-monnaie ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D5-Q05', libelle: 'ICO ou émission de jetons de titres ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
      { code: 'D5-Q06', libelle: 'Société domiciliée hors UE sans justification économique ?', estDeclencheur: true, niveauSiOui: 'Élevé' },
    ],
  },
];

export interface ArpecAxeResult {
  code: string;
  libelle: string;
  niveau: ArpecNiveau;
  nbOui: number;
  nbTotal: number;
}

export interface ArpecEvaluationResult {
  axes: ArpecAxeResult[];
  niveauCalcule: ArpecNiveau;
  niveauRetenu: ArpecNiveau;
  vigilance: ArpecVigilance;
  declencheursActifs: string[];
}

function maxNiveau(a: ArpecNiveau, b: ArpecNiveau): ArpecNiveau {
  return NIVEAU_RANK[a] >= NIVEAU_RANK[b] ? a : b;
}

export function computeAxeLevel(
  questions: ArpecQuestionDef[],
  reponses: Record<string, ArpecReponse>,
): ArpecNiveau {
  let niveau: ArpecNiveau = 'Faible';

  for (const q of questions) {
    if (reponses[q.code] !== 'O') continue;
    if (q.estDeclencheur) {
      return 'Élevé';
    }
    niveau = maxNiveau(niveau, q.niveauSiOui === 'Élevé' ? 'Élevé' : 'Moyen');
  }

  return niveau;
}

export function computeArpecEvaluation(
  reponses: Record<string, ArpecReponse>,
  modulation: ArpecModulation,
  axes: readonly ArpecAxeDef[] = ARPEC_AXES_FALLBACK,
): ArpecEvaluationResult {
  const axeResults: ArpecAxeResult[] = axes.map((axe) => {
    const nbOui = axe.questions.filter((q) => reponses[q.code] === 'O').length;
    return {
      code: axe.code,
      libelle: axe.libelle,
      niveau: computeAxeLevel(axe.questions, reponses),
      nbOui,
      nbTotal: axe.questions.length,
    };
  });

  let niveauCalcule: ArpecNiveau = 'Faible';
  for (const axe of axeResults) {
    niveauCalcule = maxNiveau(niveauCalcule, axe.niveau);
  }

  const rank = Math.max(0, Math.min(2, NIVEAU_RANK[niveauCalcule] + modulation));
  const niveauRetenu = NIVEAU_BY_RANK[rank];
  const vigilance: ArpecVigilance = niveauRetenu === 'Élevé' ? 'Renforcée' : 'Standard';

  const declencheursActifs: string[] = [];
  for (const axe of axes) {
    for (const q of axe.questions) {
      if (reponses[q.code] === 'O' && q.estDeclencheur) {
        declencheursActifs.push(q.libelle);
      }
    }
  }

  return { axes: axeResults, niveauCalcule, niveauRetenu, vigilance, declencheursActifs };
}

export function countAnswered(reponses: Record<string, ArpecReponse>): number {
  return Object.values(reponses).filter((r) => r === 'O' || r === 'N').length;
}

export function totalQuestions(axes: readonly ArpecAxeDef[] = ARPEC_AXES_FALLBACK): number {
  return axes.reduce((sum, axe) => sum + axe.questions.length, 0);
}

export interface ArpecAxeCompleteness {
  code: string;
  libelle: string;
  answered: number;
  total: number;
}

export interface ArpecCompletenessResult {
  complete: boolean;
  answeredCount: number;
  totalCount: number;
  incompleteAxes: ArpecAxeCompleteness[];
}

/** Complétude questionnaire ARPEC — 54 réponses OUI/NON, contrôle global et par axe (§4.1 specs-lab). */
export function assessQuestionnaireCompleteness(
  reponses: Record<string, ArpecReponse>,
  axes: readonly ArpecAxeDef[] = ARPEC_AXES_FALLBACK,
): ArpecCompletenessResult {
  const totalCount = totalQuestions(axes);
  const incompleteAxes: ArpecAxeCompleteness[] = [];

  for (const axe of axes) {
    const total = axe.questions.length;
    const answered = axe.questions.filter(
      (q) => reponses[q.code] === 'O' || reponses[q.code] === 'N',
    ).length;
    if (answered < total) {
      incompleteAxes.push({ code: axe.code, libelle: axe.libelle, answered, total });
    }
  }

  const answeredCount = countAnswered(reponses);
  return {
    complete: answeredCount === totalCount && incompleteAxes.length === 0,
    answeredCount,
    totalCount,
    incompleteAxes,
  };
}

export function buildCompletenessValidationMessage(result: ArpecCompletenessResult): string {
  if (result.complete) return '';

  if (result.incompleteAxes.length === 1) {
    const axe = result.incompleteAxes[0];
    return `Questionnaire ARPEC incomplet : axe ${axe.code} — ${axe.answered}/${axe.total} réponses. Complétez toutes les questions OUI/NON.`;
  }

  if (result.incompleteAxes.length > 0) {
    const axes = result.incompleteAxes.map((a) => `${a.code} (${a.answered}/${a.total})`).join(', ');
    return `Questionnaire ARPEC incomplet — axes à compléter : ${axes}.`;
  }

  return `Questionnaire ARPEC incomplet — ${result.answeredCount}/${result.totalCount} réponses. Les ${result.totalCount} questions doivent être renseignées (OUI ou NON).`;
}
