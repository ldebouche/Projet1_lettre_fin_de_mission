import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
 * Écran ARPEC — questionnaire 5 axes / 54 questions.
 * Aligné maquette 02 sans score /100 ni niveau « Très élevé ».
 */
@Component({
  selector: 'app-lab-evaluation-risque',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabCarteComponent],
  templateUrl: './lab-evaluation-risque.html',
  styleUrls: ['./lab-evaluation-risque.scss'],
})
export class LabEvaluationRisqueComponent implements OnInit, OnChanges {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private labService = inject(LabService);

  @Input() codeClient = '';
  @Input() raisonSociale = '';
  /** Mode intégré dans le wizard (masque le hero interne). */
  @Input() embedded = false;

  @Output() evaluationChange = new EventEmitter<ReturnType<typeof computeArpecEvaluation>>();

  axes: readonly ArpecAxeDef[] = ARPEC_AXES_FALLBACK;

  reponses: Record<string, ArpecReponse> = {};
  modulation: ArpecModulation = 0;
  justification = '';
  showJustificationHint = false;
  showCompletenessHint = false;
  validationError: string | null = null;
  saveNotice: string | null = null;
  submitError: string | null = null;
  submitting = false;
  loadingEvaluation = false;
  loadingQuestionnaire = false;
  returnTo: string | null = null;
  /** true si les réponses proviennent de l'évaluation active en base (prioritaire sur le brouillon local). */
  private hydratedFromServer = false;

  ngOnInit(): void {
    this.returnTo = this.route.snapshot.queryParamMap.get('returnTo')?.trim() || null;
    if (!this.codeClient) {
      const code = this.route.snapshot.queryParamMap.get('code_client')?.trim();
      if (code) this.codeClient = code;
    }
    void this.initializeComponent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['codeClient'] && !changes['codeClient'].firstChange) {
      void this.loadState();
    }
  }

  private async initializeComponent(): Promise<void> {
    await this.loadQuestionnaire();
    await this.loadState();
  }

  private async loadQuestionnaire(): Promise<void> {
    this.loadingQuestionnaire = true;
    try {
      const res = await firstValueFrom(this.labService.getArpecQuestionnaire());
      const axes = Array.isArray(res.data?.axes) ? res.data.axes : [];
      if (axes.length > 0) {
        this.axes = axes;
      } else {
        this.saveNotice = 'Référentiel ARPEC API vide — version locale utilisée.';
      }
    } catch (err) {
      console.error('Erreur chargement questionnaire ARPEC:', err);
      this.axes = ARPEC_AXES_FALLBACK;
      this.saveNotice = 'Référentiel ARPEC API indisponible — version locale utilisée.';
    } finally {
      this.loadingQuestionnaire = false;
    }
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

  async openPlanSuivi(): Promise<void> {
    this.submitError = null;

    if (!this.validateEvaluation()) {
      this.submitError = this.validationError;
      return;
    }

    const code = (this.codeClient || '').trim();
    if (!code) {
      this.submitError = 'Code client requis pour enregistrer l’évaluation.';
      return;
    }

    this.submitting = true;
    try {
      const payload = this.getSubmitPayload();
      payload.code_client = code;
      await firstValueFrom(this.labService.saveArpecEvaluation(payload));
      try {
        localStorage.removeItem(this.storageKey());
      } catch {
        // ignore
      }
      const queryParams: Record<string, string> = { code_client: code };
      if (this.returnTo) queryParams['returnTo'] = this.returnTo;
      await this.router.navigate(['/lab/dossier'], { queryParams });
    } catch (err: unknown) {
      console.error('Erreur enregistrement ARPEC:', err);
      const apiErr = err as { error?: { error?: string }; message?: string; status?: number };
      const message = apiErr?.error?.error || apiErr?.message || 'Enregistrement impossible.';
      if (apiErr?.status === 503) {
        this.submitError = `${message} — Le schéma lab_arpec_* doit être appliqué en base pour persister l’évaluation.`;
      } else if (apiErr?.status === 400 && message.toLowerCase().includes('justification')) {
        this.showJustificationHint = true;
        this.submitError = message;
      } else {
        this.submitError = message;
      }
    } finally {
      this.submitting = false;
    }
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
