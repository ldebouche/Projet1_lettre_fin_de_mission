import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import {
  ARPEC_AXES_FALLBACK,
  ArpecAxeDef,
  ArpecModulation,
  ArpecReponse,
  assessQuestionnaireCompleteness,
  buildCompletenessValidationMessage,
  computeArpecEvaluation,
  countAnswered,
  totalQuestions,
} from './lab-arpec-data';
import { LabArpecEvaluationData, LabSaveArpecEvaluationRequest, LabService } from '../../../services/lab-service';

interface StoredArpecState {
  reponses: Record<string, ArpecReponse>;
  modulation: ArpecModulation;
  justification: string;
}

/**
 * Écran ARPEC — questionnaire chargé via GET /api/lab/arpec/questionnaire.
 * En production, l’échec de l’API est bloquant (pas de jeu local 2019).
 */
@Component({
  selector: 'app-lab-evaluation-risque',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent],
  templateUrl: './lab-evaluation-risque.html',
  styleUrls: ['./lab-evaluation-risque.scss'],
})
export class LabEvaluationRisqueComponent implements OnInit, OnChanges {
  private labService = inject(LabService);

  @Input() codeClient = '';
  @Input() raisonSociale = '';
  /** Mode intégré dans le wizard (seul usage : plus de page autonome). */
  @Input() embedded = true;

  @Output() evaluationChange = new EventEmitter<ReturnType<typeof computeArpecEvaluation>>();

  axes: readonly ArpecAxeDef[] = [];

  reponses: Record<string, ArpecReponse> = {};
  modulation: ArpecModulation = 0;
  justification = '';
  showJustificationHint = false;
  showCompletenessHint = false;
  validationError: string | null = null;
  saveNotice: string | null = null;
  /** Alerte bloquante si le référentiel API est indisponible (prod) ou vide. */
  questionnaireError: string | null = null;
  questionnaireBlocked = false;
  loadingEvaluation = false;
  loadingQuestionnaire = false;
  /** true si les réponses proviennent de l'évaluation active en base (prioritaire sur le brouillon local). */
  private hydratedFromServer = false;

  ngOnInit(): void {
    void this.initializeComponent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['codeClient'] && !changes['codeClient'].firstChange) {
      void this.initializeComponent();
    }
  }

  private async initializeComponent(): Promise<void> {
    await this.loadQuestionnaire();
    await this.loadState();
  }

  private async loadQuestionnaire(): Promise<void> {
    this.loadingQuestionnaire = true;
    this.questionnaireError = null;
    this.questionnaireBlocked = false;
    const allowLocalFallback = await this.resolveAllowLocalFallback();
    const code = (this.codeClient || '').trim();
    if (!code) {
      this.applyQuestionnaireFailure(
        'code_client requis pour charger le questionnaire ARPEC filtré.',
        allowLocalFallback,
      );
      this.loadingQuestionnaire = false;
      return;
    }
    try {
      const res = await firstValueFrom(this.labService.getArpecQuestionnaire(code));
      const axesRaw = Array.isArray(res.data?.axes) ? res.data.axes : [];
      const axes = axesRaw
        .map((axe) => ({
          ...axe,
          questions: (axe.questions ?? []).filter((q) => q.visible !== false),
        }))
        .filter((axe) => axe.questions.length > 0);
      if (axes.length > 0) {
        this.axes = axes;
        return;
      }
      this.applyQuestionnaireFailure(
        'Aucune question ARPEC visible pour ce dossier (référentiel vide ou non filtré).',
        allowLocalFallback,
      );
    } catch (err) {
      console.error('Erreur chargement questionnaire ARPEC:', err);
      this.applyQuestionnaireFailure(
        'Le questionnaire ARPEC n’a pas pu être chargé.',
        allowLocalFallback,
      );
    } finally {
      this.loadingQuestionnaire = false;
    }
  }

  /**
   * Fallback local uniquement en `ng serve` (isDevMode) ou si l’API signale DEMO_AUTH.
   * Production : jamais.
   */
  private async resolveAllowLocalFallback(): Promise<boolean> {
    if (isDevMode()) return true;
    try {
      const me = await firstValueFrom(this.labService.getMeLab());
      return me.data?.isDemo === true;
    } catch {
      return false;
    }
  }

  private applyQuestionnaireFailure(reason: string, allowLocalFallback: boolean): void {
    if (allowLocalFallback && ARPEC_AXES_FALLBACK.length > 0) {
      this.axes = ARPEC_AXES_FALLBACK;
      this.saveNotice = `${reason} Fallback local (dev/DEMO) — ne pas utiliser en production.`;
      return;
    }
    this.axes = [];
    this.questionnaireBlocked = true;
    this.questionnaireError = allowLocalFallback
      ? `${reason} Le fallback local ne contient plus le questionnaire 2019. Vérifiez l’API et les tables lab_arpec_*.`
      : `${reason} L’évaluation est bloquée : le référentiel doit venir de la base. Contactez l’équipe LAB / informatique.`;
  }

  private initReponses(): void {
    for (const axe of this.axes) {
      for (const q of axe.questions) {
        if (!(q.code in this.reponses)) {
          this.reponses[q.code] = null;
        }
      }
    }
  }

  private storageKey(): string {
    const code = (this.codeClient || 'sans-code').trim();
    return `lab-arpec-eval:${code}`;
  }

  /** Charge l'évaluation active en base ; localStorage uniquement en secours brouillon. */
  private async loadState(): Promise<void> {
    this.initReponses();
    this.hydratedFromServer = false;
    this.saveNotice = null;

    const code = (this.codeClient || '').trim();
    if (!code) {
      this.applyLocalDraft();
      this.emitEvaluation();
      return;
    }

    this.loadingEvaluation = true;
    try {
      const res = await firstValueFrom(this.labService.getArpecEvaluation(code));
      this.applyServerEvaluation(res.data);
      this.hydratedFromServer = true;
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 404) {
        this.applyLocalDraft();
      } else if (apiErr?.status === 503) {
        this.applyLocalDraft();
        this.saveNotice = 'Évaluation serveur indisponible — brouillon local utilisé si présent.';
      } else {
        console.error('Erreur chargement évaluation ARPEC:', err);
        this.applyLocalDraft();
        this.saveNotice = 'Chargement serveur impossible — brouillon local utilisé si présent.';
      }
    } finally {
      this.loadingEvaluation = false;
      this.emitEvaluation();
    }
  }

  private applyServerEvaluation(data: LabArpecEvaluationData): void {
    this.initReponses();
    for (const rep of data.reponses ?? []) {
      if (rep.code_question in this.reponses) {
        this.reponses[rep.code_question] = rep.reponse;
      }
    }
    const modMap: Record<LabArpecEvaluationData['modulation'], ArpecModulation> = {
      Conforme: 0,
      Hausse: 1,
      Baisse: -1,
    };
    this.modulation = modMap[data.modulation] ?? 0;
    this.justification = data.justification_modulation?.trim() ?? '';
    this.showJustificationHint = this.modulation !== 0 && !this.justification.trim();
  }

  private applyLocalDraft(): void {
    this.initReponses();
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredArpecState;
      if (parsed.reponses) {
        this.reponses = { ...this.reponses, ...parsed.reponses };
      }
      this.modulation = parsed.modulation ?? 0;
      this.justification = parsed.justification ?? '';
      this.saveNotice = 'Brouillon local repris (aucune évaluation active en base ou serveur indisponible).';
    } catch {
      // ignore corrupt local state
    }
  }

  private persistLocalState(): void {
    if (this.hydratedFromServer) return;
    const payload: StoredArpecState = {
      reponses: this.reponses,
      modulation: this.modulation,
      justification: this.justification,
    };
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(payload));
      this.saveNotice = 'Brouillon enregistré pour reprendre l’évaluation plus tard.';
    } catch {
      this.saveNotice = null;
    }
  }

  get evaluation() {
    return computeArpecEvaluation(this.reponses, this.modulation, this.axes);
  }

  get answeredCount(): number {
    return countAnswered(this.reponses);
  }

  get questionTotal(): number {
    return totalQuestions(this.axes);
  }

  get clientLabel(): string {
    return this.raisonSociale?.trim() || this.codeClient?.trim() || 'Client';
  }

  setReponse(code: string, value: ArpecReponse): void {
    if (this.hydratedFromServer) {
      this.hydratedFromServer = false;
      this.saveNotice = null;
    }
    this.reponses[code] = value;
    if (this.showCompletenessHint && assessQuestionnaireCompleteness(this.reponses, this.axes).complete) {
      this.showCompletenessHint = false;
      if (this.validationError?.includes('incomplet')) {
        this.validationError = null;
      }
    }
    this.persistLocalState();
    this.emitEvaluation();
  }

  onModulationChange(value: ArpecModulation): void {
    if (this.hydratedFromServer) {
      this.hydratedFromServer = false;
      this.saveNotice = null;
    }
    this.modulation = value;
    this.showJustificationHint = value !== 0 && !this.justification.trim();
    this.persistLocalState();
    this.emitEvaluation();
  }

  onJustificationChange(): void {
    if (this.hydratedFromServer) {
      this.hydratedFromServer = false;
      this.saveNotice = null;
    }
    this.showJustificationHint = this.modulation !== 0 && !this.justification.trim();
    this.persistLocalState();
  }

  niveauPillClass(niveau: string): string {
    if (niveau === 'Élevé') return 'pill pill--red';
    if (niveau === 'Moyen') return 'pill pill--amber';
    return 'pill pill--green';
  }

  vigilancePillClass(vigilance: string): string {
    return vigilance === 'Renforcée' ? 'pill pill--red' : 'pill pill--green';
  }

  axisMiniFillPct(nbOui: number, nbTotal: number): number {
    if (!nbTotal) return 0;
    return Math.round((nbOui / nbTotal) * 100);
  }

  isQuestionAnswered(code: string): boolean {
    const value = this.reponses[code];
    return value === 'O' || value === 'N';
  }

  validateEvaluation(): boolean {
    this.validationError = null;
    this.showJustificationHint = false;
    this.showCompletenessHint = false;

    if (this.questionnaireBlocked || this.axes.length === 0) {
      this.validationError =
        this.questionnaireError ||
        'Questionnaire ARPEC indisponible — impossible de valider.';
      return false;
    }

    const completeness = assessQuestionnaireCompleteness(this.reponses, this.axes);
    if (!completeness.complete) {
      this.showCompletenessHint = true;
      this.validationError = buildCompletenessValidationMessage(completeness);
      return false;
    }

    if (this.modulation !== 0 && !this.justification.trim()) {
      this.showJustificationHint = true;
      this.validationError = 'Une justification est obligatoire pour moduler le niveau.';
      return false;
    }

    return true;
  }

  /** Payload pour POST /api/lab/arpec/evaluation (soumission wizard). */
  getSubmitPayload(): LabSaveArpecEvaluationRequest {
    const modulationMap: Record<ArpecModulation, LabSaveArpecEvaluationRequest['modulation']> = {
      0: 'Conforme',
      1: 'Hausse',
      [-1]: 'Baisse',
    };
    const reponses: LabSaveArpecEvaluationRequest['reponses'] = [];
    for (const axe of this.axes) {
      for (const q of axe.questions) {
        const value = this.reponses[q.code];
        if (value === 'O' || value === 'N') {
          reponses.push({ code_question: q.code, reponse: value });
        }
      }
    }
    return {
      code_client: (this.codeClient || '').trim(),
      reponses,
      modulation: modulationMap[this.modulation],
      justification_modulation: this.modulation !== 0 ? this.justification.trim() : null,
      commentaire: null,
    };
  }

  axeSubtitle(code: string): string {
    const axe = this.evaluation.axes.find((a) => a.code === code);
    if (!axe) return '';
    return `${axe.nbOui} / ${axe.nbTotal} OUI · ${axe.niveau}`;
  }

  private emitEvaluation(): void {
    this.evaluationChange.emit(this.evaluation);
  }
}
