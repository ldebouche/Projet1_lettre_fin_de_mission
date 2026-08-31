/**
 * Types et calcul ARPEC (règle déclencheur + axe le plus fort).
 * Le référentiel questions n’est plus embarqué : source = GET /api/lab/arpec/questionnaire.
 * ARPEC_AXES_FALLBACK est volontairement vide (plus de 54 Q 2019) — livrable 5.1b.
 */

export type ArpecNiveau = 'Faible' | 'Moyen' | 'Élevé';
export type ArpecVigilance = 'Standard' | 'Renforcée';
export type ArpecReponse = 'O' | 'N' | null;

export interface ArpecQuestionDef {
  code: string;
  libelle: string;
  sousAxe?: string;
  visible?: boolean;
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

/** Fallback local : vide. Un jeu 2019 ne doit plus jamais s’afficher si l’API échoue. */
export const ARPEC_AXES_FALLBACK: readonly ArpecAxeDef[] = [];

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

/** Complétude questionnaire ARPEC — questions visibles renvoyées par l’API (cachées = NON serveur). */
export function assessQuestionnaireCompleteness(
  reponses: Record<string, ArpecReponse>,
  axes: readonly ArpecAxeDef[] = ARPEC_AXES_FALLBACK,
): ArpecCompletenessResult {
  const visibleAxes = axes.map((axe) => ({
    ...axe,
    questions: axe.questions.filter((q) => q.visible !== false),
  }));
  const totalCount = totalQuestions(visibleAxes);
  const incompleteAxes: ArpecAxeCompleteness[] = [];

  for (const axe of visibleAxes) {
    const total = axe.questions.length;
    const answered = axe.questions.filter(
      (q) => reponses[q.code] === 'O' || reponses[q.code] === 'N',
    ).length;
    if (answered < total) {
      incompleteAxes.push({ code: axe.code, libelle: axe.libelle, answered, total });
    }
  }

  const answeredCount = visibleAxes.reduce(
    (sum, axe) =>
      sum + axe.questions.filter((q) => reponses[q.code] === 'O' || reponses[q.code] === 'N').length,
    0,
  );
  return {
    complete: totalCount > 0 && answeredCount === totalCount && incompleteAxes.length === 0,
    answeredCount,
    totalCount,
    incompleteAxes,
  };
}

export function buildCompletenessValidationMessage(result: ArpecCompletenessResult): string {
  if (result.complete) return '';

  if (result.totalCount === 0) {
    return 'Questionnaire ARPEC indisponible — aucune question chargée. Impossible de valider.';
  }

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
