import {
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  LabBodaccAlerte,
  LabBodaccChecklistEntry,
  LabCreateDossierRequest,
  LabDossierResponse,
  LabEnrichissementResponse,
  LabFieldMeta,
  LabService,
  LabWizardBrouillonArpec,
  LabWizardBrouillonPayload,
  LabWizardFormModel,
  WizardBeRow,
  WizardPieceRow,
} from '../../../services/lab-service';
import { LabEvaluationRisqueComponent } from '../lab-evaluation-risque/lab-evaluation-risque';
import { LabWizardIdentiteComponent } from '../lab-wizard-identite/lab-wizard-identite';
import { LabWizardKycComponent } from '../lab-wizard-kyc/lab-wizard-kyc';
import { LabWizardBeComponent } from '../lab-wizard-be/lab-wizard-be';
import { LabWizardPiecesComponent } from '../lab-wizard-pieces/lab-wizard-pieces';
import { LabWizardCommentaireComponent } from '../lab-wizard-commentaire/lab-wizard-commentaire';
import { LabWizardDirigeantComponent } from '../lab-wizard-dirigeant/lab-wizard-dirigeant';
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
  getPiecesToUpdate,
  hydrateFromDossier as hydrateWizardData,
  isPersistedId,
  mapBeToUpdate,
  mapPieceToCreate,
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
    LabWizardDirigeantComponent,
    LabWizardCommentaireComponent,
    LabEvaluationRisqueComponent,
    LabCarteComponent,
  ],
  templateUrl: './lab-dossier-form-wizard.html',
  styleUrls: ['./lab-dossier-form-wizard.scss'],
})
export class LabDossierFormWizardComponent implements OnInit, OnDestroy {
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
  draftNotice: string | null = null;
  private loadedSessionKey: string | null = null;
  private draftReady = false;
  private draftSaveInFlight = false;
  private lastDraftJson: string | null = null;
  private draftTimer: ReturnType<typeof setInterval> | null = null;
  private pendingArpecDraft: LabWizardBrouillonArpec | null = null;
  private pendingBodaccDraft: Record<string, LabBodaccChecklistEntry> | null = null;

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
    dirigeant: 'section-dirigeant',
    kyc: 'section-kyc',
    be: 'section-be',
    pieces: 'section-pieces',
    commentaire: 'section-commentaire-etape1',
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
    if (!this.deletedPieceIds.includes(id)) {
      this.deletedPieceIds = [...this.deletedPieceIds, id];
    }
    // Suppression immédiate en base : la fiche dossier ne garde plus la pièce
    // en attendant la validation de la revue.
    void this.deletePersistedPieceNow(id);
  }

  private async deletePersistedPieceNow(id: string): Promise<void> {
    try {
      await firstValueFrom(this.labService.deletePieceLab(id));
      this.deletedPieceIds = this.deletedPieceIds.filter((x) => x !== id);
      const code = (this.m.code_client || this.codeClient || '').trim();
      if (code) {
        void import('../lab-dossier/lab-dossier').then((m) => {
          m.LabDossierComponent.clearDossierCache(code);
        });
      }
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 404) {
        this.deletedPieceIds = this.deletedPieceIds.filter((x) => x !== id);
        return;
      }
      // Échec réseau : retentera à l’enregistrement final via deletedPieceIds.
      console.warn('Suppression pièce KYC différée à l’enregistrement:', err);
    }
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

  ngOnDestroy(): void {
    this.stopDraftAutosave();
    void this.flushDraft();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    void this.flushDraft();
  }

  private applyCodeClient(code: string | null): void {
    this.codeClient = code;
    this.submitError = null;
    if (!code) {
      this.stopDraftAutosave();
      this.draftReady = false;
      this.lastDraftJson = null;
      this.draftNotice = null;
      this.pendingArpecDraft = null;
      this.pendingBodaccDraft = null;
      this.loadedSessionKey = null;
      return;
    }

    const sessionKey = `${code}|${this.idRevue || ''}|${this.isAcceptationMode ? '1' : '0'}`;
    if (sessionKey === this.loadedSessionKey) return;

    this.stopDraftAutosave();
    this.draftReady = false;
    this.lastDraftJson = null;
    this.draftNotice = null;
    this.pendingArpecDraft = null;
    this.pendingBodaccDraft = null;
    this.loadedSessionKey = sessionKey;
    this.stepIndex = 0;
    this.m.code_client = code;
    this.hasExistingLabDossier = false;
    void this.loadDossier(code);
  }

  private async loadDossier(codeClient: string): Promise<void> {
    this.loading = true;
    this.errorMessage = null;
    const sessionKey = this.loadedSessionKey;

    try {
      // Prefetch brouillon en parallèle du dossier (même résultat final, moins d’attente).
      const draftParams = this.draftQueryParams();
      const dossierPromise = firstValueFrom(this.labService.getDossierLab(codeClient, { view: 'wizard' }));
      const draftPromise = draftParams
        ? firstValueFrom(this.labService.getWizardBrouillonLab(draftParams)).catch((err: unknown) => {
            const apiErr = err as { status?: number };
            if (apiErr?.status === 503) {
              this.draftNotice =
                'Enregistrement automatique indisponible (table lab_wizard_brouillons absente).';
            } else if (apiErr?.status !== 404) {
              console.warn('Erreur chargement brouillon wizard LAB:', err);
            }
            return null;
          })
        : Promise.resolve(null);

      const res = await dossierPromise;
      const data = res?.data ?? null;
      if (!data?.client) {
        this.errorMessage = 'Aucune donnée client trouvée pour ce code.';
        return;
      }

      this.hydrateFromDossier(data);
      if (this.hasExistingLabDossier && !this.idRevue && !this.isAcceptationMode) {
        this.errorMessage =
          'Révision impossible : paramètre id_revue manquant. Lancez ou reprenez la revue depuis le plan & suivi.';
        return;
      }

      // Enrichissement en arrière-plan : n’bloque plus l’ouverture (< 1 s).
      const draftRes = await draftPromise;
      this.applyDraftResponse(draftRes);
      this.reconcileFieldMetaWithCurrentForm();
      this.startDraftAutosave();

      void this.fetchEnrichmentData().then((enrichData) => {
        if (!enrichData || this.loadedSessionKey !== sessionKey) return;
        this.applyEnrichment(enrichData);
        this.reconcileFieldMetaWithCurrentForm();
      });
    } catch (err) {
      console.error('Erreur chargement dossier LAB (formulaire):', err);
      this.errorMessage = 'Impossible de charger les données existantes.';
    } finally {
      this.loading = false;
    }
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
        sourceLabel: 'Fiche client',
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
    void this.enrichFromPublicApisAsync();
  }

  private async enrichFromPublicApisAsync(): Promise<void> {
    this.enriching = true;
    this.enrichmentError = null;
    try {
      const data = await this.fetchEnrichmentData();
      if (data) {
        this.applyEnrichment(data);
        this.reconcileFieldMetaWithCurrentForm();
      }
    } finally {
      this.enriching = false;
    }
  }

  /** Appels registres publics uniquement — n’applique pas encore au formulaire. */
  private async fetchEnrichmentData(): Promise<LabEnrichissementResponse | null> {
    const siret = toInputStr(this.m.siret).replace(/\s/g, '');
    const siren = toInputStr(this.m.siren).replace(/\s/g, '') || (siret.length >= 9 ? siret.slice(0, 9) : '');
    if (!siret && siren.length !== 9) {
      this.enrichmentError = 'Saisissez un SIREN (9 chiffres) ou SIRET (14 chiffres) pour enrichir.';
      return null;
    }

    this.enriching = true;
    this.enrichmentError = null;

    try {
      const res = await firstValueFrom(
        this.labService.getEnrichissementLab({
          siret: siret || undefined,
          siren: siren || undefined,
          code_client: this.m.code_client || this.codeClient || undefined,
        }),
      );
      return res.data ?? null;
    } catch (err: unknown) {
      console.error('Erreur enrichissement LAB:', err);
      const apiErr = err as { error?: { error?: string } };
      this.enrichmentError =
        apiErr?.error?.error || 'Enrichissement depuis les registres publics impossible.';
      return null;
    } finally {
      this.enriching = false;
    }
  }

  private canUseDraftPersistence(): boolean {
    const code = (this.m.code_client || this.codeClient || '').trim();
    if (!code || this.isWizardLocked) return false;
    return !!this.idRevue || this.isAcceptationMode || !this.hasExistingLabDossier;
  }

  private draftQueryParams(): {
    code_client: string;
    id_revue?: string;
    mode?: string;
  } | null {
    const code = (this.m.code_client || this.codeClient || '').trim();
    if (!code || !this.canUseDraftPersistence()) return null;
    if (this.idRevue) {
      return { code_client: code, id_revue: this.idRevue };
    }
    return { code_client: code, mode: 'acceptation' };
  }

  private startDraftAutosave(): void {
    this.stopDraftAutosave();
    if (!this.canUseDraftPersistence()) return;
    this.draftTimer = setInterval(() => {
      void this.flushDraft();
    }, 2000);
  }

  private stopDraftAutosave(): void {
    if (this.draftTimer != null) {
      clearInterval(this.draftTimer);
      this.draftTimer = null;
    }
  }

  private serializePiecesForDraft(pieces: WizardPieceRow[]): LabWizardBrouillonPayload['pieces'] {
    return pieces.map((p) => {
      const { pendingFile: _pendingFile, ...rest } = p;
      return { ...rest, pendingFile: null };
    });
  }

  private buildDraftPayload(): LabWizardBrouillonPayload {
    const arpecLive = this.evalRisque?.getDraftState() ?? null;
    const arpec = arpecLive ?? this.pendingArpecDraft;
    const bodaccLive = this.bodaccChecklist?.exportChecklistState() ?? null;
    if (bodaccLive) {
      this.pendingBodaccDraft = bodaccLive;
    }
    if (arpecLive) {
      this.pendingArpecDraft = arpecLive;
    }

    return {
      version: 1,
      stepIndex: this.stepIndex,
      m: structuredClone(this.m),
      beneficiaires: structuredClone(this.beneficiaires),
      pieces: this.serializePiecesForDraft(this.pieces),
      deletedBeneficiaireIds: [...this.deletedBeneficiaireIds],
      deletedPieceIds: [...this.deletedPieceIds],
      arpec,
      bodaccChecklist: this.pendingBodaccDraft,
    };
  }

  private async flushDraft(force = false): Promise<void> {
    if (!this.draftReady || this.draftSaveInFlight || this.submitting || this.revueActionBusy) {
      return;
    }
    const params = this.draftQueryParams();
    if (!params) return;

    const payload = this.buildDraftPayload();
    const json = JSON.stringify(payload);
    if (!force && json === this.lastDraftJson) return;

    this.draftSaveInFlight = true;
    try {
      await firstValueFrom(
        this.labService.saveWizardBrouillonLab(params.code_client, {
          payload,
          id_revue: params.id_revue ?? null,
          mode: params.mode ?? null,
        }),
      );
      this.lastDraftJson = json;
      const stamp = new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      this.draftNotice = `Brouillon enregistré à ${stamp}`;
    } catch (err: unknown) {
      const apiErr = err as { status?: number; error?: { error?: string } };
      if (apiErr?.status === 503) {
        this.draftNotice =
          'Enregistrement automatique indisponible (table lab_wizard_brouillons absente).';
        this.stopDraftAutosave();
      } else {
        console.warn('Erreur sauvegarde brouillon wizard LAB:', err);
      }
    } finally {
      this.draftSaveInFlight = false;
    }
  }

  private async clearDraft(): Promise<void> {
    const params = this.draftQueryParams();
    this.stopDraftAutosave();
    this.draftReady = false;
    this.lastDraftJson = null;
    this.pendingArpecDraft = null;
    this.pendingBodaccDraft = null;
    if (!params) return;
    try {
      await firstValueFrom(this.labService.deleteWizardBrouillonLab(params));
    } catch (err) {
      console.warn('Erreur suppression brouillon wizard LAB:', err);
    }
  }

  private async loadAndApplyBrouillon(): Promise<void> {
    this.draftReady = false;
    const params = this.draftQueryParams();
    if (!params) {
      this.draftReady = this.canUseDraftPersistence();
      return;
    }

    try {
      const res = await firstValueFrom(this.labService.getWizardBrouillonLab(params));
      this.applyDraftResponse(res);
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 503) {
        this.draftNotice =
          'Enregistrement automatique indisponible (table lab_wizard_brouillons absente).';
      } else if (apiErr?.status !== 404) {
        console.warn('Erreur chargement brouillon wizard LAB:', err);
      }
    } finally {
      this.draftReady = this.canUseDraftPersistence();
      if (this.draftReady) {
        this.lastDraftJson = JSON.stringify(this.buildDraftPayload());
      }
    }
  }

  private applyDraftResponse(
    res: { data?: { brouillon?: { payload?: LabWizardBrouillonPayload | null } | null } } | null,
  ): void {
    this.draftReady = false;
    try {
      const payload = res?.data?.brouillon?.payload;
      if (payload && typeof payload === 'object') {
        this.applyDraftPayload(payload);
        this.draftNotice = 'Brouillon repris — vous pouvez continuer où vous vous êtes arrêté.';
      }
    } finally {
      this.draftReady = this.canUseDraftPersistence();
      if (this.draftReady) {
        this.lastDraftJson = JSON.stringify(this.buildDraftPayload());
      }
    }
  }

  private applyDraftPayload(payload: LabWizardBrouillonPayload): void {
    if (payload.m && typeof payload.m === 'object') {
      const base = createEmptyWizardForm();
      this.m = {
        ...base,
        ...payload.m,
        kyc: { ...base.kyc, ...(payload.m.kyc || {}) },
        dirigeant: { ...base.dirigeant, ...(payload.m.dirigeant || {}) },
      };
      if (this.codeClient) {
        this.m.code_client = this.codeClient;
      }
    }

    if (Array.isArray(payload.beneficiaires) && payload.beneficiaires.length > 0) {
      this.beneficiaires = payload.beneficiaires.map((row) => ({ ...row }));
    }
    if (Array.isArray(payload.pieces) && payload.pieces.length > 0) {
      this.pieces = payload.pieces.map((row) => ({ ...row, pendingFile: null }));
    }
    if (Array.isArray(payload.deletedBeneficiaireIds)) {
      this.deletedBeneficiaireIds = [...payload.deletedBeneficiaireIds];
    }
    if (Array.isArray(payload.deletedPieceIds)) {
      this.deletedPieceIds = [...payload.deletedPieceIds];
    }

    this.pendingArpecDraft = payload.arpec ?? null;
    this.pendingBodaccDraft = payload.bodaccChecklist ?? null;

    const targetStep =
      typeof payload.stepIndex === 'number' && payload.stepIndex >= 1
        ? 1
        : 0;
    this.stepIndex = targetStep;

    setTimeout(() => {
      this.applyPendingBodaccDraft();
      this.applyPendingArpecDraft();
      this.reconcileFieldMetaWithCurrentForm();
    }, 0);
  }

  private applyPendingBodaccDraft(): void {
    if (!this.pendingBodaccDraft) return;
    this.bodaccChecklist?.importChecklistState(this.pendingBodaccDraft);
  }

  private applyPendingArpecDraft(): void {
    if (!this.pendingArpecDraft || !this.evalRisque) return;
    this.evalRisque.applyDraftState(this.pendingArpecDraft);
  }

  private applyEnrichment(data: LabEnrichissementResponse): void {
    if (!data?.ok) {
      this.enrichmentError = data?.error || 'Enrichissement impossible.';
      return;
    }

    this.fieldMeta = { ...this.fieldMeta, ...(data.fields ?? {}) };
    this.alertesBodacc = data.alertesBodacc ?? [];
    this.enrichmentSources = data.sources ?? null;
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
    this.reconcileFieldMetaWithCurrentForm();
  }

  /** Ne remplit que les champs vides — ne réécrit jamais une saisie / un brouillon. */
  private applyMergedValue(field: EnrichableStringField, value: unknown): void {
    if (value == null || value === '') return;
    if (toInputStr(this.m[field])) return;
    this.m[field] = String(value);
  }

  private normalizeCompareValue(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private valuesMatch(a: unknown, b: unknown): boolean {
    const na = this.normalizeCompareValue(a);
    const nb = this.normalizeCompareValue(b);
    if (!na && !nb) return true;
    return na === nb;
  }

  private getFormFieldValue(fieldKey: string): string {
    if (fieldKey === 'kyc.pays_implantation') return toInputStr(this.m.kyc.pays_implantation);
    if (fieldKey === 'kyc.secteurs_text') return toInputStr(this.m.kyc.secteurs_text);
    if (isEnrichableStringField(fieldKey)) return toInputStr(this.m[fieldKey]);
    return '';
  }

  /**
   * Recalcule les écarts registre vs saisie actuelle (brouillon si repris, sinon BDD hydratée).
   * L’API enrichissement compare à la BDD seule — on réalignement côté formulaire.
   */
  private reconcileFieldMetaWithCurrentForm(): void {
    const next: Record<string, LabFieldMeta> = { ...this.fieldMeta };

    for (const [key, meta] of Object.entries(next)) {
      if (!meta) continue;
      const current = this.getFormFieldValue(key);
      const apiValue = toInputStr(meta.apiValue);

      let status: LabFieldMeta['status'];
      let value = current;
      let source = meta.source;
      let sourceLabel = meta.sourceLabel;

      if (!current && !apiValue) {
        status = 'empty';
        value = '';
      } else if (!current && apiValue) {
        status = 'prefilled';
        value = apiValue;
        source = meta.apiSource;
        sourceLabel = meta.apiSourceLabel;
      } else if (current && !apiValue) {
        status = 'bdd';
        source = source || 'BDD';
        sourceLabel = sourceLabel || 'Valeur actuelle';
      } else if (this.valuesMatch(current, apiValue)) {
        status = 'prefilled';
        value = current;
        source = meta.apiSource || source || 'BDD';
        sourceLabel = meta.apiSourceLabel || sourceLabel || 'Registre public';
      } else {
        status = 'divergence';
        value = current;
        source = 'BDD';
        sourceLabel = 'Valeur actuelle';
      }

      next[key] = {
        ...meta,
        value,
        source,
        sourceLabel,
        status,
        bddValue: current || null,
        apiValue: apiValue || null,
      };
    }

    this.fieldMeta = next;
    this.divergenceCount = Object.values(this.fieldMeta).filter((f) => f.status === 'divergence').length;
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
      bddValue: meta.apiValue,
    };
    this.divergenceCount = Object.values(this.fieldMeta).filter((f) => f.status === 'divergence').length;
    void this.flushDraft(true);
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
    if (this.evalRisque) {
      this.pendingArpecDraft = this.evalRisque.getDraftState();
    }
    this.stepIndex--;
    setTimeout(() => this.applyPendingBodaccDraft(), 0);
    void this.flushDraft(true);
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
        setTimeout(() => this.applyPendingArpecDraft(), 0);
        await this.flushDraft(true);
      } catch (err: unknown) {
        console.error('Erreur sauvegarde intermédiaire étape 1 wizard LAB:', err);
        this.submitError = this.formatSubmitApiError(err);
      } finally {
        this.step1Saving = false;
      }
      return;
    }

    this.stepIndex++;
    void this.flushDraft(true);
  }

  onBodaccProgressChange(pendingCritical: number): void {
    this.bodaccPendingCritical = pendingCritical;
  }

  goToWizardStep(stepId: string): void {
    const anchor = this.sectionAnchorByWizardStep[stepId] ?? `section-${stepId}`;
    this.scrollToSection(anchor);
  }

  /** Navigation sommaire / BODACC — scroll JS (les href # ne marchent pas avec le router Angular). */
  scrollToSection(sectionId: string): void {
    if (this.isWizardLocked || !sectionId) return;
    this.stepIndex = 0;
    if (sectionId === 'section-bodacc') {
      this.bodaccSectionOpen = true;
    }
    const tryScroll = (attempt: number): void => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (attempt < 5) {
        setTimeout(() => tryScroll(attempt + 1), 50);
      }
    };
    setTimeout(() => tryScroll(0), 0);
  }

  onBodaccSectionToggle(open: boolean): void {
    this.bodaccSectionOpen = open;
  }

  private async persistStep1(
    codeClient: string,
    statutDossierOverride?: string,
  ): Promise<void> {
    if (this.isWizardLocked) {
      throw new Error(
        'Révision impossible : lancez ou reprenez la revue depuis le plan & suivi.',
      );
    }
    await firstValueFrom(this.labService.updateClientLab(codeClient, buildClientPayload(this.m)));

    const lab = {
      ...buildLabPayload(this.m, this.idRevue),
      ...(statutDossierOverride ? { statut_dossier: statutDossierOverride } : {}),
    };
    if (statutDossierOverride) {
      this.m.statut_dossier = statutDossierOverride;
    }

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
      try {
        await firstValueFrom(this.labService.deletePieceLab(pieceId));
      } catch (err: unknown) {
        const apiErr = err as { status?: number };
        if (apiErr?.status !== 404) throw err;
      }
    }
    this.deletedPieceIds = [];

    for (const row of getPiecesToUpdate(this.pieces)) {
      const body = mapPieceToUpdate(row);
      if (row.pendingFile) {
        const upload = await firstValueFrom(
          this.labService.uploadPieceKycFile(codeClient, row.pendingFile),
        );
        body.nom_fichier = upload.data.nom_fichier;
        body.filepath = upload.data.filepath;
        body.reference = upload.data.nom_fichier;
        if (!body.statut || body.statut === 'Manquante') {
          body.statut = 'Recue';
        }
      }
      await firstValueFrom(this.labService.updatePieceLab(row.id, body));
      row.pendingFile = null;
      if (body.filepath) row.filepath = body.filepath;
      if (body.nom_fichier) row.nom_fichier = body.nom_fichier;
    }

    for (const row of this.pieces.filter((r) => !isPersistedId(r.id) && r.type_piece.trim())) {
      let body = mapPieceToCreate(row, codeClient);
      if (row.pendingFile) {
        const upload = await firstValueFrom(
          this.labService.uploadPieceKycFile(codeClient, row.pendingFile),
        );
        body = {
          ...body,
          nom_fichier: upload.data.nom_fichier,
          filepath: upload.data.filepath,
          reference: upload.data.nom_fichier,
          statut: !body.statut || body.statut === 'Manquante' ? 'Recue' : body.statut,
        };
      }
      const res = await firstValueFrom(this.labService.createPieceLab(body));
      if (res.data?.piece?.id) {
        row.id = res.data.piece.id;
        row.pendingFile = null;
        if (body.filepath) row.filepath = body.filepath ?? null;
        if (body.nom_fichier) row.nom_fichier = body.nom_fichier ?? null;
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
    const retryHint = 'Cliquez sur « Accepter la mission » pour réessayer.';
    if (apiErr?.status === 503) {
      return `${message} — Le dossier client est enregistré ; l’évaluation ARPEC nécessite le schéma lab_arpec_* en base. ${retryHint}`;
    }
    return `${message} — Le dossier client est enregistré ; corrigez l’évaluation du risque si besoin. ${retryHint}`;
  }

  private assertArpecReadyForDecision(): boolean {
    const evalCmp = this.evalRisque;
    if (evalCmp?.questionnaireBlocked) {
      this.stepIndex = this.steps.length - 1;
      this.submitError =
        evalCmp.questionnaireError ??
        'Questionnaire ARPEC indisponible — impossible de valider.';
      return false;
    }
    if (!evalCmp?.validateEvaluation()) {
      this.stepIndex = this.steps.length - 1;
      this.submitError =
        evalCmp?.validationError ??
        'Complétez le questionnaire ARPEC (toutes les questions OUI/NON) avant de valider.';
      return false;
    }
    return true;
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
      await this.clearDraft();
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

    if (!this.assertArpecReadyForDecision()) return;

    const code = (this.m.code_client || this.codeClient || '').trim();
    if (!code) {
      this.submitError = 'Code client requis pour enregistrer le dossier.';
      return;
    }

    if (
      !confirm(
        this.idRevue
          ? 'Accepter la mission et clôturer la revue ? L’évaluation ARPEC sera enregistrée et le plan de vigilance s’ouvrira.'
          : 'Accepter la mission ? L’évaluation ARPEC sera enregistrée et le plan de vigilance s’ouvrira.',
      )
    ) {
      return;
    }

    this.submitting = true;

    try {
      try {
        await this.persistStep1(code, 'Actif');
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

      await this.tryDownloadFicheLcbft(code);
      await this.clearDraft();

      const queryParams: Record<string, string> = { code_client: code };
      if (this.returnTo) queryParams['returnTo'] = this.returnTo;
      await this.router.navigate(['/lab/dossier'], { queryParams });
    } finally {
      this.submitting = false;
    }
  }

  /**
   * Refus de mission (acceptation ou revue) : lab_dossier.statut_dossier = Refuse,
   * hors listes (prospects / portefeuille). En revue : clôture la revue en cours.
   * N'ouvre pas le plan de vigilance.
   */
  async refuserMission(): Promise<void> {
    if (this.isWizardLocked) return;
    this.submitError = null;

    if (!this.assertArpecReadyForDecision()) return;

    const code = (this.m.code_client || this.codeClient || '').trim();
    if (!code) {
      this.submitError = 'Code client requis pour enregistrer le dossier.';
      return;
    }

    const confirmMsg = this.idRevue
      ? 'Refuser la mission et clôturer la revue ? Le dossier passera au statut « Refusé », disparaîtra du portefeuille et des listes, et le plan de vigilance ne s’ouvrira pas.'
      : 'Refuser la mission ? Le dossier passera au statut « Refusé » (prospect : hors liste d’attente ; client : hors portefeuille). Le plan de vigilance ne s’ouvrira pas.';

    if (!confirm(confirmMsg)) {
      return;
    }

    this.submitting = true;

    try {
      try {
        await this.persistStep1(code, 'Refuse');
      } catch (err: unknown) {
        console.error('Erreur refus mission LAB (étape 1):', err);
        this.submitError = this.formatSubmitApiError(err);
        return;
      }

      try {
        await this.persistStep2(code);
      } catch (err: unknown) {
        console.error('Erreur refus mission LAB (ARPEC):', err);
        this.stepIndex = this.steps.length - 1;
        this.submitError = this.formatStep2SubmitError(err);
        return;
      }

      if (this.idRevue) {
        try {
          await firstValueFrom(this.labService.cloturerRevueLab(this.idRevue, {
            commentaires_conclusion: this.m.commentaire_revision.trim() || null,
            options: {
              source: 'wizard_revision_refus',
              bodacc_checklist: this.bodaccChecklist?.exportChecklistState() ?? {},
            },
          }));
        } catch (err: unknown) {
          console.error('Erreur clôture revue LAB (refus):', err);
          this.submitError = this.formatSubmitApiError(err);
          return;
        }
      }

      await this.tryDownloadFicheLcbft(code);
      await this.clearDraft();

      await this.router.navigate(['/lab/portefeuille']);
    } finally {
      this.submitting = false;
    }
  }

  /** Génération PDF Fiche 1/2 : non bloquant si échec (décision déjà enregistrée). */
  private async tryDownloadFicheLcbft(codeClient: string): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.labService.downloadFicheLcbftLab(codeClient, this.idRevue),
      );
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = this.idRevue
        ? `LAB_Fiche2_${codeClient}_revue${this.idRevue}_${stamp}.pdf`
        : `LAB_Fiche1_${codeClient}_${stamp}.pdf`;
      this.triggerBlobDownload(blob, filename);
    } catch (err: unknown) {
      console.error('Génération PDF fiche LCB-FT:', err);
      // Ne bloque pas la navigation : ARPEC / décision déjà persistés.
    }
  }

  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
