import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  LabBodaccAlerte,
  LabCreateDossierRequest,
  LabDossierResponse,
  LabEnrichissementResponse,
  LabFieldMeta,
  LabService,
  LabWizardFormModel,
  WizardBeRow,
  WizardPieceRow,
} from '../../../services/lab-service';
import { LabEvaluationRisqueComponent } from '../lab-evaluation-risque/lab-evaluation-risque';
import { LabWizardIdentiteComponent } from '../lab-wizard-identite/lab-wizard-identite';
import { LabWizardKycComponent } from '../lab-wizard-kyc/lab-wizard-kyc';
import { LabWizardBeComponent } from '../lab-wizard-be/lab-wizard-be';
import { LabWizardPiecesComponent } from '../lab-wizard-pieces/lab-wizard-pieces';
import { LabCarteComponent } from '../lab-carte/lab-carte';
import {
  applyLocalKycPrefill,
  buildClientPayload,
  buildKycPayload,
  buildLabPayload,
  createEmptyWizardForm,
  emptyBe,
  emptyPiece,
  genWizardId,
  getBeneficiairesToCreate,
  getBeneficiairesToUpdate,
  getPiecesToCreate,
  getPiecesToUpdate,
  hydrateFromDossier as hydrateWizardData,
  isPersistedId,
  mapBeToUpdate,
  mapPieceToUpdate,
  toInputStr,
} from './lab-wizard-hydrate';

const ENRICHABLE_STRING_FIELDS = [
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
] as const;

type EnrichableStringField = (typeof ENRICHABLE_STRING_FIELDS)[number];

function isEnrichableStringField(key: string): key is EnrichableStringField {
  return (ENRICHABLE_STRING_FIELDS as readonly string[]).includes(key);
}

/**
 * Formulaire multi-étapes création / révision dossier LAB — périmètre aligné sur specs LAB (client + KYC + BE + pièces + dossier).
 */
@Component({
  selector: 'app-lab-dossier-form-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LabWizardIdentiteComponent,
    LabWizardKycComponent,
    LabWizardBeComponent,
    LabWizardPiecesComponent,
    LabEvaluationRisqueComponent,
    LabCarteComponent,
  ],
  templateUrl: './lab-dossier-form-wizard.html',
  styleUrls: ['./lab-dossier-form-wizard.scss'],
})
export class LabDossierFormWizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private labService = inject(LabService);
  private destroyRef = inject(DestroyRef);

  codeClient: string | null = null;
  returnTo: string | null = null;
  idRevue: string | null = null;
  /** Entrée depuis dashboard « Prospects » — revue/acceptation sans id_revue obligatoire. */
  isAcceptationMode = false;
  loading = false;
  enriching = false;
  errorMessage: string | null = null;
  enrichmentError: string | null = null;
  hasExistingLabDossier = false;
  fieldMeta: Record<string, LabFieldMeta> = {};
  alertesBodacc: LabBodaccAlerte[] = [];
  enrichmentSources: LabEnrichissementResponse['sources'] | null = null;
  divergenceCount = 0;
  bodaccChecklistWarning: string | null = null;
  submitError: string | null = null;
  submitting = false;
  step1Saving = false;
  revueActionBusy = false;
  bodaccPendingCritical = 0;
  private loadedCode: string | null = null;

  @ViewChild(LabWizardIdentiteComponent) identiteCmp?: LabWizardIdentiteComponent;
  @ViewChild('evalRisque') evalRisque?: LabEvaluationRisqueComponent;

  get bodaccChecklist() {
    return this.identiteCmp?.bodaccChecklist;
  }

  bodaccSectionOpen = false;

  /** Anciennes étapes wizard → ancres de la page Dossier client (étape 1). */
  private readonly sectionAnchorByWizardStep: Record<string, string> = {
    identifiants: 'section-identifiants',
    bodacc: 'section-bodacc',
    identite: 'section-identite',
    coordonnees: 'section-coordonnees',
    'fiscal-profil': 'section-fiscal',
    kyc: 'section-kyc',
    be: 'section-be',
    pieces: 'section-pieces',
    lab: 'section-affectation',
  };

  stepIndex = 0;

  readonly steps: { id: string; label: string; hint: string }[] = [
    {
      id: 'dossier-client',
      label: 'Dossier client',
      hint: 'Identifiants, enrichissement, KYC, BE, pièces, affectation',
    },
    {
      id: 'evaluation-risque',
      label: 'Évaluation du risque',
      hint: 'Questionnaire ARPEC — 5 axes',
    },
  ];

  readonly pieceTypePresets = [
    'Extrait KBIS / INSEE',
    'Statuts à jour',
    'Pièce d’identité dirigeant',
    'RBE (registre des bénéficiaires effectifs)',
    'RIB',
    'Organigramme / chaîne de détention',
    'Justificatif domicile',
    'Autre',
  ];

  m: LabWizardFormModel = createEmptyWizardForm();

  /** Libellés équipe cabinet — lecture seule, source table clients (hors périmètre wizard). */
  clientExpertComptableDisplay = '—';
  clientChefDeMissionDisplay = '—';

  beneficiaires: WizardBeRow[] = [emptyBe(genWizardId('be'))];
  pieces: WizardPieceRow[] = [emptyPiece(genWizardId('pc'))];
  deletedBeneficiaireIds: string[] = [];
  deletedPieceIds: string[] = [];

  onRemovedPersistedBeneficiaire(id: string): void {
    this.deletedBeneficiaireIds = [...this.deletedBeneficiaireIds, id];
  }

  onRemovedPersistedPiece(id: string): void {
    this.deletedPieceIds = [...this.deletedPieceIds, id];
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const code = params.get('code_client')?.trim() || null;
        this.returnTo = params.get('returnTo')?.trim() || null;
        this.idRevue = params.get('id_revue')?.trim() || null;
        this.isAcceptationMode = (params.get('mode')?.trim() || '').toLowerCase() === 'acceptation';
        this.applyCodeClient(code);
      });
  }

  private applyCodeClient(code: string | null): void {
    this.codeClient = code;
    this.submitError = null;
    if (!code) {
      this.loadedCode = null;
      return;
    }
    if (code === this.loadedCode) return;
    this.loadedCode = code;
    this.stepIndex = 0;
    this.m.code_client = code;
    this.loadDossier(code);
  }

  private loadDossier(codeClient: string): void {
    this.loading = true;
    this.errorMessage = null;

    this.labService.getDossierLab(codeClient).subscribe({
      next: (res: { data: LabDossierResponse | null }) => {
        const data = res?.data ?? null;
        if (!data?.client) {
          this.errorMessage = 'Aucune donnée client trouvée pour ce code.';
        } else {
          this.hydrateFromDossier(data);
          if (this.hasExistingLabDossier && !this.idRevue && !this.isAcceptationMode) {
            this.errorMessage =
              'Révision impossible : paramètre id_revue manquant. Lancez ou reprenez la revue depuis le plan & suivi.';
          } else {
            void this.enrichFromPublicApis();
          }
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement dossier LAB (formulaire):', err);
        this.loading = false;
        this.errorMessage = 'Impossible de charger les données existantes.';
      },
    });
  }

  private hydrateFromDossier(data: LabDossierResponse): void {
    const result = hydrateWizardData(this.m, data, genWizardId);
    this.hasExistingLabDossier = result.hasExistingLabDossier;
    this.deletedBeneficiaireIds = [];
    this.deletedPieceIds = [];
    if (result.beneficiaires) this.beneficiaires = result.beneficiaires;
    if (result.pieces) this.pieces = result.pieces;
    this.clientExpertComptableDisplay = result.clientExpertComptableDisplay;
    this.clientChefDeMissionDisplay = result.clientChefDeMissionDisplay;
    this.initFieldMetaFromForm();
    applyLocalKycPrefill(this.m);
  }

  private initFieldMetaFromForm(): void {
    const now = new Date().toISOString();
    const enrichable: Array<{ key: string; value: string }> = [
      { key: 'siren', value: this.m.siren },
      { key: 'siret', value: this.m.siret },
      { key: 'raison_sociale', value: this.m.raison_sociale },
      { key: 'forme_societe', value: this.m.forme_societe },
      { key: 'rcs', value: this.m.rcs },
      { key: 'ape', value: this.m.ape },
      { key: 'activite', value: this.m.activite },
      { key: 'nature', value: this.m.nature },
      { key: 'tvaintracom', value: this.m.tvaintracom },
      { key: 'montant_capital_social', value: this.m.montant_capital_social },
      { key: 'adr1_siege', value: this.m.adr1_siege },
      { key: 'adr2_siege', value: this.m.adr2_siege },
      { key: 'cpos_siege', value: this.m.cpos_siege },
      { key: 'ville_siege', value: this.m.ville_siege },
      { key: 'pays_siege', value: this.m.pays_siege },
      { key: 'taille_entreprise', value: this.m.taille_entreprise },
      { key: 'zone_geographique_activite', value: this.m.zone_geographique_activite },
      { key: 'volume_affaires_fourchette', value: this.m.volume_affaires_fourchette },
      { key: 'kyc.pays_implantation', value: this.m.kyc.pays_implantation },
      { key: 'kyc.secteurs_text', value: this.m.kyc.secteurs_text },
    ];

    for (const { key, value } of enrichable) {
      const v = toInputStr(value);
      if (!v) continue;
      this.fieldMeta[key] = {
        value: v,
        source: 'BDD',
        sourceLabel: 'BDD',
        fetchedAt: now,
        status: 'bdd',
        bddValue: v,
        apiValue: null,
        apiSource: null,
        apiSourceLabel: null,
      };
    }
  }

  enrichFromPublicApis(): void {
    const siret = toInputStr(this.m.siret).replace(/\s/g, '');
    const siren = toInputStr(this.m.siren).replace(/\s/g, '') || (siret.length >= 9 ? siret.slice(0, 9) : '');
    if (!siret && siren.length !== 9) {
      this.enrichmentError = 'Saisissez un SIREN (9 chiffres) ou SIRET (14 chiffres) pour enrichir.';
      return;
    }

    this.enriching = true;
    this.enrichmentError = null;

    this.labService.getEnrichissementLab({
      siret: siret || undefined,
      siren: siren || undefined,
      code_client: this.m.code_client || this.codeClient || undefined,
    }).subscribe({
      next: (res) => {
        this.applyEnrichment(res.data);
        this.enriching = false;
      },
      error: (err) => {
        console.error('Erreur enrichissement LAB:', err);
        this.enriching = false;
        this.enrichmentError = err?.error?.error || 'Enrichissement depuis les registres publics impossible.';
      },
    });
  }

  private applyEnrichment(data: LabEnrichissementResponse): void {
    if (!data?.ok) {
      this.enrichmentError = data?.error || 'Enrichissement impossible.';
      return;
    }

    this.fieldMeta = { ...this.fieldMeta, ...(data.fields ?? {}) };
    this.alertesBodacc = data.alertesBodacc ?? [];
    this.enrichmentSources = data.sources ?? null;
    this.divergenceCount = data.divergences?.length ?? 0;
    this.bodaccPendingCritical = (data.alertesBodacc ?? []).filter((a) => a.gravite === 'elevee').length;

    const merged = data.merged ?? {};
    this.applyMergedValue('siren', merged['siren']);
    this.applyMergedValue('siret', merged['siret']);
    this.applyMergedValue('raison_sociale', merged['raison_sociale']);
    this.applyMergedValue('forme_societe', merged['forme_societe']);
    this.applyMergedValue('rcs', merged['rcs']);
    this.applyMergedValue('ape', merged['ape']);
    this.applyMergedValue('activite', merged['activite']);
    this.applyMergedValue('nature', merged['nature']);
    this.applyMergedValue('tvaintracom', merged['tvaintracom']);
    this.applyMergedValue('montant_capital_social', merged['montant_capital_social']);
    this.applyMergedValue('adr1_siege', merged['adr1_siege']);
    this.applyMergedValue('adr2_siege', merged['adr2_siege']);
    this.applyMergedValue('cpos_siege', merged['cpos_siege']);
    this.applyMergedValue('ville_siege', merged['ville_siege']);
    this.applyMergedValue('pays_siege', merged['pays_siege']);
    this.applyMergedValue('taille_entreprise', merged['taille_entreprise']);
    this.applyMergedValue('zone_geographique_activite', merged['zone_geographique_activite']);
    this.applyMergedValue('volume_affaires_fourchette', merged['volume_affaires_fourchette']);

    const kycMerged = merged['kyc'] as Record<string, unknown> | undefined;
    if (kycMerged) {
      if (kycMerged['pays_implantation'] && !this.m.kyc.pays_implantation) {
        this.m.kyc.pays_implantation = String(kycMerged['pays_implantation']);
      }
      if (kycMerged['secteurs_text'] && !this.m.kyc.secteurs_text) {
        this.m.kyc.secteurs_text = String(kycMerged['secteurs_text']);
      }
      if (kycMerged['pays_a_risque_text'] && !this.m.kyc.pays_a_risque_text.trim()) {
        this.m.kyc.pays_a_risque_text = String(kycMerged['pays_a_risque_text']);
      }
      if (kycMerged['secteur_sensible'] === true) {
        this.m.kyc.secteur_sensible = true;
      }
    }
    applyLocalKycPrefill(this.m);
  }

  private applyMergedValue(field: EnrichableStringField, value: unknown): void {
    if (value == null || value === '') return;
    this.m[field] = String(value);
  }

  getFieldMeta(key: string): LabFieldMeta | null {
    return this.fieldMeta[key] ?? null;
  }

  acceptApiValue(fieldKey: string): void {
    const meta = this.fieldMeta[fieldKey];
    if (!meta?.apiValue) return;

    if (fieldKey === 'kyc.pays_implantation') {
      this.m.kyc.pays_implantation = meta.apiValue;
    } else if (fieldKey === 'kyc.secteurs_text') {
      this.m.kyc.secteurs_text = meta.apiValue;
    } else if (isEnrichableStringField(fieldKey)) {
      this.m[fieldKey] = meta.apiValue;
    }

    this.fieldMeta[fieldKey] = {
      ...meta,
      value: meta.apiValue,
      source: meta.apiSource,
      sourceLabel: meta.apiSourceLabel,
      status: 'prefilled',
      bddValue: meta.bddValue,
    };
    this.divergenceCount = Object.values(this.fieldMeta).filter((f) => f.status === 'divergence').length;
  }

  onSiretBlur(): void {
    const siret = toInputStr(this.m.siret).replace(/\s/g, '');
    if (siret.length === 14) {
      this.m.siren = siret.slice(0, 9);
      void this.enrichFromPublicApis();
    }
  }

  get isFirstStep(): boolean {
    return this.stepIndex <= 0;
  }

  get isLastStep(): boolean {
    return this.stepIndex >= this.steps.length - 1;
  }

  /** Dossier LAB déjà en base : il faut une revue (`id_revue`) ou le mode acceptation. */
  get isWizardLocked(): boolean {
    return this.hasExistingLabDossier && !this.idRevue && !this.isAcceptationMode;
  }

  goPrev(): void {
    if (this.isWizardLocked || this.isFirstStep) return;
    this.stepIndex--;
  }

  async onStepperSelect(targetIndex: number): Promise<void> {
    if (this.isWizardLocked || this.step1Saving || this.submitting || this.revueActionBusy) return;
    if (targetIndex === this.stepIndex) return;
    if (targetIndex < this.stepIndex) {
      this.stepIndex = targetIndex;
      return;
    }
    if (targetIndex === this.stepIndex + 1) {
      await this.goNext();
    }
  }

  async goNext(): Promise<void> {
    if (this.isWizardLocked || this.isLastStep || this.step1Saving) return;

    if (this.stepIndex === 0) {
      const pending = this.bodaccChecklist?.pendingCriticalCount ?? this.bodaccPendingCritical;
      if (pending > 0) {
        this.bodaccChecklistWarning = `${pending} annonce(s) BODACC critique(s) non traitées — vous pouvez poursuivre (non bloquant).`;
        this.bodaccSectionOpen = true;
      } else {
        this.bodaccChecklistWarning = null;
      }

      const code = (this.m.code_client || this.codeClient || '').trim();
      if (!code) {
        this.submitError = 'Code client requis pour enregistrer le dossier.';
        return;
      }

      this.submitError = null;
      this.step1Saving = true;

      try {
        await this.persistStep1(code);
        this.stepIndex++;
      } catch (err: unknown) {
        console.error('Erreur sauvegarde intermédiaire étape 1 wizard LAB:', err);
        this.submitError = this.formatSubmitApiError(err);
      } finally {
        this.step1Saving = false;
      }
      return;
    }

    this.stepIndex++;
  }

  onBodaccProgressChange(pendingCritical: number): void {
    this.bodaccPendingCritical = pendingCritical;
  }

  goToWizardStep(stepId: string): void {
    if (this.isWizardLocked) return;
    this.stepIndex = 0;
    const anchor = this.sectionAnchorByWizardStep[stepId] ?? `section-${stepId}`;
    if (anchor === 'section-bodacc') {
      this.bodaccSectionOpen = true;
    }
    setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  onBodaccSectionToggle(open: boolean): void {
    this.bodaccSectionOpen = open;
  }

  private async persistStep1(codeClient: string): Promise<void> {
    if (this.isWizardLocked) {
      throw new Error(
        'Révision impossible : lancez ou reprenez la revue depuis le plan & suivi.',
      );
    }
    await firstValueFrom(this.labService.updateClientLab(codeClient, buildClientPayload(this.m)));

    const lab = buildLabPayload(this.m, this.idRevue);

    if (this.hasExistingLabDossier) {
      await firstValueFrom(this.labService.updateDossierLab(codeClient, { lab }));
    } else {
      const body: LabCreateDossierRequest = {
        code_client: codeClient,
        lab,
        options: { creer_evenement_entree: true },
      };
      await firstValueFrom(this.labService.createDossierLab(body));
      this.hasExistingLabDossier = true;
    }

    await firstValueFrom(this.labService.updateKycLab(codeClient, buildKycPayload(this.m)));

    for (const beId of this.deletedBeneficiaireIds) {
      await firstValueFrom(this.labService.deleteBeneficiaireLab(beId));
    }
    this.deletedBeneficiaireIds = [];

    for (const row of getBeneficiairesToUpdate(this.beneficiaires)) {
      await firstValueFrom(this.labService.updateBeneficiaireLab(row.id, mapBeToUpdate(row)));
    }

    for (const be of getBeneficiairesToCreate(this.beneficiaires, codeClient)) {
      const res = await firstValueFrom(this.labService.createBeneficiaireLab(be));
      if (res.data?.beneficiaire?.id) {
        const match = this.beneficiaires.find((r) => r.nom.trim() === be.nom && !isPersistedId(r.id));
        if (match) match.id = res.data.beneficiaire.id;
      }
    }

    for (const pieceId of this.deletedPieceIds) {
      await firstValueFrom(this.labService.deletePieceLab(pieceId));
    }
    this.deletedPieceIds = [];

    for (const row of getPiecesToUpdate(this.pieces)) {
      await firstValueFrom(this.labService.updatePieceLab(row.id, mapPieceToUpdate(row)));
    }

    for (const piece of getPiecesToCreate(this.pieces, codeClient)) {
      const res = await firstValueFrom(this.labService.createPieceLab(piece));
      if (res.data?.piece?.id) {
        const match = this.pieces.find((r) => r.type_piece.trim() === piece.type_piece && !isPersistedId(r.id));
        if (match) match.id = res.data.piece.id;
      }
    }
  }

  private async persistStep2(codeClient: string): Promise<void> {
    if (!this.evalRisque) {
      throw new Error('Évaluation du risque indisponible');
    }
    if (this.evalRisque.questionnaireBlocked) {
      throw new Error(
        this.evalRisque.questionnaireError ||
          'Questionnaire ARPEC indisponible — impossible d’enregistrer l’évaluation.',
      );
    }
    const payload = this.evalRisque.getSubmitPayload();
    payload.code_client = codeClient;
    await firstValueFrom(this.labService.saveArpecEvaluation(payload));
    try {
      localStorage.removeItem(`lab-arpec-eval:${codeClient}`);
    } catch {
      // ignore
    }
  }

  private formatSubmitApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Enregistrement impossible.';
  }

  private formatStep2SubmitError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string; status?: number };
    const message = this.formatSubmitApiError(err);
    const retryHint = 'Cliquez sur « Valider et ouvrir le plan de vigilance » pour réessayer.';
    if (apiErr?.status === 503) {
      return `${message} — Le dossier client est enregistré ; l’évaluation ARPEC nécessite le schéma lab_arpec_* en base. ${retryHint}`;
    }
    return `${message} — Le dossier client est enregistré ; corrigez l’évaluation du risque si besoin. ${retryHint}`;
  }

  get isRevisionSession(): boolean {
    return !!this.idRevue;
  }

  get arpecQuestionnaireBlocked(): boolean {
    return this.evalRisque?.questionnaireBlocked === true;
  }

  async annulerRevue(): Promise<void> {
    if (!this.idRevue || this.revueActionBusy) return;
    if (
      !confirm(
        'Annuler la revue ? Les modifications seront annulées et l\'état au lancement sera restauré.',
      )
    ) {
      return;
    }

    this.revueActionBusy = true;
    this.submitError = null;

    try {
      await firstValueFrom(this.labService.annulerRevueLab(this.idRevue));
      const code = (this.m.code_client || this.codeClient || '').trim();
      const queryParams: Record<string, string> = {};
      if (code) queryParams['code_client'] = code;
      if (this.returnTo) queryParams['returnTo'] = this.returnTo;
      await this.router.navigate(['/lab/dossier'], { queryParams });
    } catch (err: unknown) {
      console.error('Erreur annulation revue LAB:', err);
      this.submitError = this.formatSubmitApiError(err);
    } finally {
      this.revueActionBusy = false;
    }
  }

  async submitWizard(): Promise<void> {
    if (this.isWizardLocked) return;
    this.submitError = null;

    const pendingCritical = this.bodaccChecklist?.pendingCriticalCount ?? this.bodaccPendingCritical;
    if (pendingCritical > 0) {
      this.stepIndex = 0;
      this.bodaccSectionOpen = true;
      this.submitError =
        `${pendingCritical} annonce(s) BODACC critique(s) non traitées — validation impossible.`;
      return;
    }

    const evalCmp = this.evalRisque;
    if (evalCmp?.questionnaireBlocked) {
      this.stepIndex = this.steps.length - 1;
      this.submitError =
        evalCmp.questionnaireError ??
        'Questionnaire ARPEC indisponible — impossible de valider.';
      return;
    }
    if (!evalCmp?.validateEvaluation()) {
      this.stepIndex = this.steps.length - 1;
      this.submitError =
        evalCmp?.validationError ??
        'Complétez le questionnaire ARPEC (toutes les questions OUI/NON) avant de valider.';
      return;
    }

    const code = (this.m.code_client || this.codeClient || '').trim();
    if (!code) {
      this.submitError = 'Code client requis pour enregistrer le dossier.';
      return;
    }

    this.submitting = true;

    try {
      try {
        await this.persistStep1(code);
      } catch (err: unknown) {
        console.error('Erreur étape 1 wizard LAB:', err);
        this.submitError = this.formatSubmitApiError(err);
        return;
      }

      try {
        await this.persistStep2(code);
      } catch (err: unknown) {
        console.error('Erreur étape 2 wizard LAB (ARPEC):', err);
        this.stepIndex = this.steps.length - 1;
        this.submitError = this.formatStep2SubmitError(err);
        return;
      }

      if (this.idRevue) {
        try {
          await firstValueFrom(this.labService.cloturerRevueLab(this.idRevue, {
            commentaires_conclusion: this.m.commentaire_revision.trim() || null,
            options: {
              source: 'wizard_revision',
              bodacc_checklist: this.bodaccChecklist?.exportChecklistState() ?? {},
            },
          }));
        } catch (err: unknown) {
          console.error('Erreur clôture revue LAB:', err);
          this.submitError = this.formatSubmitApiError(err);
          return;
        }
      }

      const queryParams: Record<string, string> = { code_client: code };
      if (this.returnTo) queryParams['returnTo'] = this.returnTo;
      await this.router.navigate(['/lab/dossier'], { queryParams });
    } finally {
      this.submitting = false;
    }
  }
}
