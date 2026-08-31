import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LabChatDossierComponent } from '../lab-chat-dossier/lab-chat-dossier';
import { LabDossierKycComponent } from '../lab-dossier-kyc/lab-dossier-kyc';
import { LabDossierBeneficiairesComponent } from '../lab-dossier-beneficiaires/lab-dossier-beneficiaires';
import { LabDossierPiecesComponent } from '../lab-dossier-pieces/lab-dossier-pieces';
import { LabDossierEvenementsComponent } from '../lab-dossier-evenements/lab-dossier-evenements';
import { LabDossierPlanComponent } from '../lab-dossier-plan/lab-dossier-plan';
import { LabDossierRevuesComponent } from '../lab-dossier-revues/lab-dossier-revues';
import { LabDossierHistoriqueComponent } from '../lab-dossier-historique/lab-dossier-historique';
import { LabDossierAuditComponent } from '../lab-dossier-audit/lab-dossier-audit';
import {
  LabService,
  LabDossierResponse,
  LabClientBloc,
  LabDossierBloc,
  LabEvenement,
  LabDiligence,
  LabBeneficiaireEffectif,
  LabPieceKyc,
  LabKycBloc,
  LabRevue,
  LabRevueEnCours,
  LabRisqueHistoriqueItem,
  LabAuditItem,
} from '../../../services/lab-service';

type LabBadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

@Component({
  selector: 'app-lab-dossier',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LabChatDossierComponent,
    LabDossierKycComponent,
    LabDossierBeneficiairesComponent,
    LabDossierPiecesComponent,
    LabDossierEvenementsComponent,
    LabDossierPlanComponent,
    LabDossierRevuesComponent,
    LabDossierHistoriqueComponent,
    LabDossierAuditComponent,
  ],
  templateUrl: './lab-dossier.html',
  styleUrls: ['./lab-dossier.scss']
})
export class LabDossierComponent implements OnInit, OnDestroy {
  codeClient: string | null = null;
  returnTo: string | null = null;
  loading = false;
  errorMessage: string | null = null;

  client: LabClientBloc | null = null;
  lab: LabDossierBloc | null = null;

  kyc: LabKycBloc | null = null;

  beneficiaires: LabBeneficiaireEffectif[] = [];
  pieces: LabPieceKyc[] = [];
  evenements: LabEvenement[] = [];
  diligences: LabDiligence[] = [];
  revues: LabRevue[] = [];
  risqueHistorique: LabRisqueHistoriqueItem[] = [];
  audit: LabAuditItem[] = [];
  revueEnCours: LabRevueEnCours | null = null;

  meIsFull = false;
  meIdSellsy: string | null = null;
  private pendingChat = false;
  private pendingIdEvenement: string | null = null;
  private pendingIdDiligence: string | null = null;

  actionBusy = false;
  actionError: string | null = null;

  @ViewChild('evenementsCmp') evenementsCmp?: LabDossierEvenementsComponent;
  @ViewChild('planCmp') planCmp?: LabDossierPlanComponent;

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private labService: LabService
  ) {}

  ngOnInit(): void {
    this.loadMeAccess();
    // On écoute les changements de query string : naviguer vers un autre
    // code_client sur /lab/dossier réutilise la même instance, il faut donc
    // recharger le dossier à chaque changement (sinon l'ancien reste affiché).
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const code = params.get('code_client');
      this.codeClient = code ? code.trim() : null;
      this.returnTo = params.get('returnTo')?.trim() || null;
      this.pendingChat = params.get('chat') === '1';
      this.pendingIdEvenement = params.get('id_evenement')?.trim() || null;
      this.pendingIdDiligence = params.get('id_diligence')?.trim() || null;

      if (!this.codeClient) {
        this.client = null;
        this.lab = null;
        this.resetDetailCollections();
        this.loading = false;
        this.errorMessage = 'Le dossier à ouvrir n’est pas indiqué.';
        return;
      }

      this.errorMessage = null;
      this.loadDossier();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private loadMeAccess(): void {
    this.labService.getMeLab().subscribe({
      next: (res) => {
        this.meIsFull = !!res.data?.isFull;
        this.meIdSellsy = res.data?.id_sellsy?.trim() || null;
      },
      error: () => {
        this.meIsFull = false;
        this.meIdSellsy = null;
      },
    });
  }

  get canValiderCloture(): boolean {
    if (this.meIsFull) return true;
    const resp = (this.lab?.id_responsable_lab || '').trim();
    const me = (this.meIdSellsy || '').trim();
    return !!resp && !!me && resp === me;
  }

  /** Query params pour les liens internes LAB (code client + retour éventuel). */
  get labLinkQueryParams(): Record<string, string> {
    const code = this.client?.code_client || this.codeClient;
    const params: Record<string, string> = {};
    if (code) params['code_client'] = code;
    if (this.returnTo) params['returnTo'] = this.returnTo;
    return params;
  }

  private loadDossier(): void {
    if (!this.codeClient) return;
    this.loading = true;
    this.errorMessage = null;
    this.resetDetailCollections();

    this.labService.getDossierLab(this.codeClient).subscribe({
      next: (res: { data: LabDossierResponse | null }) => {
        const data = res?.data ?? null;
        this.client = data?.client ?? null;
        this.lab = data?.lab ?? null;
        this.kyc = data?.kyc ?? null;
        this.beneficiaires = data?.beneficiaires ?? [];
        this.pieces = data?.pieces ?? [];
        this.evenements = data?.evenements ?? [];
        this.diligences = data?.diligences ?? [];
        this.revues = data?.revues ?? [];
        this.risqueHistorique = data?.risqueHistorique ?? [];
        this.audit = data?.audit ?? [];
        this.revueEnCours = data?.revue_en_cours ?? null;
        this.loading = false;
        if (!data?.client || !data.lab) {
          this.errorMessage = 'Aucun dossier LAB trouvé pour ce client.';
        } else {
          this.applyPendingChat();
        }
      },
      error: (err) => {
        console.error('Erreur chargement dossier LAB:', err);
        this.loading = false;
        this.errorMessage = 'Impossible de charger le dossier LAB.';
      }
    });
  }

  private resetDetailCollections(): void {
    this.kyc = null;
    this.beneficiaires = [];
    this.pieces = [];
    this.evenements = [];
    this.diligences = [];
    this.revues = [];
    this.risqueHistorique = [];
    this.audit = [];
    this.revueEnCours = null;
  }

  onSectionChanged(): void {
    this.actionError = null;
    this.loadDossier();
  }

  private applyPendingChat(): void {
    if (!this.pendingChat) return;
    const idDiligence = this.pendingIdDiligence;
    const idEvenement = this.pendingIdEvenement;
    this.pendingChat = false;
    this.pendingIdEvenement = null;
    this.pendingIdDiligence = null;

    setTimeout(() => {
      if (idDiligence) {
        const diligence = this.diligences.find((d) => String(d.id) === String(idDiligence));
        if (diligence) this.planCmp?.openDiligenceDiscussion(diligence);
        return;
      }
      if (idEvenement) {
        const evenement = this.evenements.find((e) => String(e.id) === String(idEvenement));
        if (evenement) this.evenementsCmp?.openEvenementDiscussion(evenement);
      }
    }, 0);
  }

  // ===== Formatage des libellés =====

  getRisqueLabel(): string {
    const niveau = this.lab?.niveau_risque;
    if (niveau == null || String(niveau).trim() === '') return 'Non évalué';
    const clean = String(niveau).trim();
    if (clean === 'Eleve') return 'Élevé';
    if (clean === 'Non evalue') return 'Non évalué';
    return clean;
  }

  getRisqueClass(): string {
    const niveau = this.lab?.niveau_risque != null
      ? String(this.lab.niveau_risque).trim()
      : '';
    if (niveau === 'Eleve') return 'badge-risque badge-eleve';
    if (niveau === 'Moyen') return 'badge-risque badge-moyen';
    if (niveau === 'Faible') return 'badge-risque badge-faible';
    return 'badge-risque badge-non-evalue';
  }

  getStatutDossierLabel(): string {
    const s = this.lab?.statut_dossier;
    return s && String(s).trim() !== '' ? String(s).trim() : '—';
  }

  getStatutKycLabel(): string {
    const s = this.lab?.statut_kyc;
    if (s == null || String(s).trim() === '') return '—';
    const clean = String(s).trim();
    if (clean === 'Pieces_perimees') return 'Pièces périmées';
    return clean;
  }

  getKycTone(): LabBadgeTone {
    const s = this.lab?.statut_kyc != null ? String(this.lab.statut_kyc).trim() : '';
    if (s === 'Complet') return 'ok';
    if (s === 'Pieces_perimees') return 'danger';
    if (s === 'Incomplet') return 'warn';
    return 'neutral';
  }

  getKycStatusDetail(): string {
    if (!this.kyc) return 'Détails KYC non encore branchés';
    const pieces = this.pieces;
    const manquantes = pieces.filter((p) => p.statut === 'Manquante').length;
    const perimees = pieces.filter((p) => p.statut === 'Perimee').length;
    const aRenseigner = this.kyc.origine_fonds_requise && this.kyc.origine_fonds_statut === 'A_renseigner';
    const parts = [
      manquantes > 0 ? `${manquantes} manquante(s)` : null,
      perimees > 0 ? `${perimees} périmée(s)` : null,
      aRenseigner ? `origine des fonds à renseigner` : null,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join(' • ') : 'Aucun point bloquant détecté';
  }

  /** Scroll fluide vers une section de la fiche (accès rapides). */
  scrollToSection(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  getSoumisIsLabel(): string {
    const v = this.client?.soumis_is;
    if (v == null || String(v).trim() === '') return '—';
    const clean = String(v).trim().toUpperCase();
    if (clean === 'O' || clean === 'OUI' || clean === '1' || clean === 'TRUE') return 'Oui';
    if (clean === 'N' || clean === 'NON' || clean === '0' || clean === 'FALSE') return 'Non';
    return clean;
  }

  getAdresseSiege(): string {
    if (!this.client) return '—';
    const parts = [
      this.client.adr1_siege,
      this.client.adr2_siege,
      [this.client.cpos_siege, this.client.ville_siege].filter(Boolean).join(' ')
    ].filter((p) => p && String(p).trim() !== '');
    return parts.length ? parts.join(', ') : '—';
  }

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }

  /** Formate un nom de collaborateur à partir du prénom + nom (vide → tiret). */
  formatCollaborateur(prenom: string | null | undefined, nom: string | null | undefined): string {
    const p = prenom != null ? String(prenom).trim() : '';
    const n = nom != null ? String(nom).trim() : '';
    const full = [p, n].filter((x) => x !== '').join(' ');
    return full !== '' ? full : '—';
  }

  // ===== Plan & suivi — revue =====

  get evenementsBloquantsRevue(): LabEvenement[] {
    return this.evenements.filter(
      (e) =>
        e.type !== 'REVUE_ANNUELLE' &&
        (e.statut === 'Ouvert' || e.statut === 'En_cours' || e.statut === 'A_VALIDER'),
    );
  }

  get canLancerRevue(): boolean {
    return !this.revueEnCours && this.evenementsBloquantsRevue.length === 0 && !this.actionBusy;
  }

  get lancerRevueDisabledReason(): string | null {
    if (this.revueEnCours) {
      return 'Une revue est déjà en cours — reprenez-la ou annulez-la depuis le formulaire de révision.';
    }
    if (this.evenementsBloquantsRevue.length > 0) {
      return 'Clôturez d\'abord les événements ouverts (hors revue annuelle) avant de lancer une revue.';
    }
    return null;
  }

  private navigateWizardUrl(wizardUrl: string): void {
    const url = new URL(wizardUrl, window.location.origin);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    if (this.returnTo) {
      queryParams['returnTo'] = this.returnTo;
    }
    void this.router.navigate([url.pathname], { queryParams });
  }

  private formatApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Opération impossible.';
  }

  onReprendreRevue(): void {
    if (!this.revueEnCours?.wizard_url) return;
    this.navigateWizardUrl(this.revueEnCours.wizard_url);
  }

  onReviserDossier(): void {
    this.startOrResumeRevision();
  }

  onLancerRevue(): void {
    this.startOrResumeRevision();
  }

  private startOrResumeRevision(): void {
    const code = this.client?.code_client || this.codeClient;
    if (!code || this.actionBusy) return;

    if (this.revueEnCours?.wizard_url) {
      this.navigateWizardUrl(this.revueEnCours.wizard_url);
      return;
    }

    if (this.evenementsBloquantsRevue.length > 0) {
      this.actionError = this.lancerRevueDisabledReason;
      return;
    }

    this.actionBusy = true;
    this.actionError = null;

    this.labService.createRevueLab({
      code_client: code,
      id_responsable: this.lab?.id_responsable_lab ?? undefined,
    }).subscribe({
      next: (res) => {
        this.actionBusy = false;
        const wizardUrl = res.data?.wizard_url;
        if (wizardUrl) {
          this.navigateWizardUrl(wizardUrl);
        } else if (res.data?.revue?.id) {
          void this.router.navigate(['/lab/dossier/formulaire'], {
            queryParams: {
              code_client: code,
              id_revue: String(res.data.revue.id),
              ...(this.returnTo ? { returnTo: this.returnTo } : {}),
            },
          });
        }
      },
      error: (err) => {
        console.error('Erreur lancement revue LAB:', err);
        this.actionBusy = false;
        this.actionError = this.formatApiError(err);
      },
    });
  }
}
