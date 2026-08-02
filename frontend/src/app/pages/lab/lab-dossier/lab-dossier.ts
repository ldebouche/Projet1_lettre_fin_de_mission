import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, switchMap } from 'rxjs';
import { ModalComponent } from '../../../shared/modal/modal';
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
  LabManualEvenementType,
  LabCreateEvenementRequest,
  LabUpdateEvenementRequest,
  LabCloturerEvenementRequest,
  LabCreateDiligenceRequest,
  LabUpdateDiligenceRequest,
  LabCreateBeneficiaireRequest,
  LabUpdateBeneficiaireRequest,
  LabCreatePieceRequest,
  LabUpdatePieceRequest,
} from '../../../services/lab-service';

type LabBadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

type EvenementModalMode = 'create' | 'edit' | 'close' | null;
type DiligenceModalMode = 'create' | 'edit' | null;
type BeneficiaireModalMode = 'create' | 'edit' | null;
type PieceModalMode = 'create' | 'edit' | null;

const PIECE_TYPE_PRESETS = [
  'KBIS',
  'Statuts',
  'Pièce d\'identité',
  'Justificatif domicile',
  'Organigramme',
  'RIB',
];

const MANUAL_EVENT_TYPES: LabManualEvenementType[] = [
  'PIECE_MANQUANTE',
  'PIECE_PERIMEE',
  'CHANGEMENT_KYC',
  'TRANSACTION_ATYPIQUE',
  'AUTRE',
];

const DILIGENCE_STATUT_LABELS: Record<string, string> = {
  A_faire: 'À faire',
  En_cours: 'En cours',
  Realisee: 'Réalisée',
  Abandonnee: 'Abandonnée',
};

const DILIGENCE_TRANSITIONS: Record<string, string[]> = {
  A_faire: ['A_faire', 'En_cours'],
  En_cours: ['En_cours', 'Realisee', 'Abandonnee'],
  Realisee: ['Realisee'],
  Abandonnee: ['Abandonnee'],
};

@Component({
  selector: 'app-lab-dossier',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ModalComponent],
  templateUrl: './lab-dossier.html',
  styleUrls: ['./lab-dossier.scss']
})
export class LabDossierComponent implements OnInit, OnDestroy {
  /**
   * Gardé pour pouvoir réactiver localement la maquette, mais l'écran utilise
   * désormais l'API LAB par défaut.
   */
  readonly demoMode = false;

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

  actionBusy = false;
  actionError: string | null = null;

  evenementModalMode: EvenementModalMode = null;
  diligenceModalMode: DiligenceModalMode = null;
  beneficiaireModalMode: BeneficiaireModalMode = null;
  pieceModalMode: PieceModalMode = null;
  selectedEvenement: LabEvenement | null = null;
  selectedDiligence: LabDiligence | null = null;
  selectedBeneficiaire: LabBeneficiaireEffectif | null = null;
  selectedPiece: LabPieceKyc | null = null;

  readonly manualEventTypes = MANUAL_EVENT_TYPES;
  readonly pieceTypePresets = PIECE_TYPE_PRESETS;

  evenementForm = {
    type_evenement: 'AUTRE' as LabManualEvenementType,
    libelle: '',
    criticite: 'Moyenne' as 'Faible' | 'Moyenne' | 'Elevee',
    statut: 'Ouvert' as 'Ouvert' | 'En_cours',
    date_echeance: '',
    conclusion: '',
    tracfin_declare: '' as '' | 'O' | 'N',
    tracfin_commentaire: '',
    diligence_intitule: '',
    diligence_echeance: '',
  };

  diligenceForm = {
    intitule: '',
    statut: 'A_faire' as LabDiligence['statut'],
    date_echeance: '',
    commentaires: '',
    ref_piece_jointe: '',
    motif_abandon: '',
  };

  beneficiaireForm = {
    nom: '',
    prenom: '',
    nationalite: '',
    pays_residence: '',
    pourcentage: '',
    mode_controle: 'Detention_capital' as LabBeneficiaireEffectif['mode_controle'],
    pep_statut: 'Non' as LabBeneficiaireEffectif['pep_statut'],
    sanctions_gel: 'Non' as LabBeneficiaireEffectif['sanctions_gel'],
    commentaire: '',
  };

  pieceForm = {
    type_piece: '',
    titulaire: 'Client' as LabPieceKyc['titulaire'],
    statut: 'Manquante' as LabPieceKyc['statut'],
    date_delivrance: '',
    date_echeance: '',
    reference: '',
    commentaire: '',
  };

  pendingPieceFile: File | null = null;

  @ViewChild('pieceFileInput') pieceFileInput?: ElementRef<HTMLInputElement>;

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private labService: LabService
  ) {}

  ngOnInit(): void {
    // On écoute les changements de query string : naviguer vers un autre
    // code_client sur /lab/dossier réutilise la même instance, il faut donc
    // recharger le dossier à chaque changement (sinon l'ancien reste affiché).
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const code = params.get('code_client');
      this.codeClient = code ? code.trim() : null;
      this.returnTo = params.get('returnTo')?.trim() || null;

      if (!this.codeClient) {
        this.client = null;
        this.lab = null;
        this.resetDetailCollections();
        this.loading = false;
        this.errorMessage = 'Paramètre code_client manquant dans l\'URL.';
        return;
      }

      this.errorMessage = null;

      if (this.demoMode) {
        this.hydrateDemoData(this.codeClient);
        return;
      }

      this.loadDossier();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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

  private hydrateDemoData(codeClient: string): void {
    this.loading = false;
    this.errorMessage = null;

    const code = String(codeClient).trim().slice(0, 10);

    // Client "cabinet" (reprend le shape existant LabClientBloc)
    this.client = {
      code_client: code,
      raison_sociale: 'ACME CONSULTING',
      forme_societe: 'SAS',
      siret: '53008580200013',
      ape: '7022Z',
      activite: 'Conseil pour les affaires et autres conseils de gestion',
      nature: 'BIC',
      rcs: 'Paris B 530 085 802',
      tvaintracom: 'FR53530085802',
      montant_capital_social: 120000,
      date_entree_cabinet: '2023-04-12',
      adr1_siege: '6 rue Ménars',
      adr2_siege: null,
      cpos_siege: '75002',
      ville_siege: 'Paris',
      tel_fixe: '01 80 90 10 10',
      tel_portable: '06 10 20 30 40',
      email: 'contact@acme-consulting.fr',
      regime_fiscal: 'Réel normal',
      soumis_is: 'O',
      mois_cloture: 12,
      logiciel_compta: 'Sage',
      expert_comptable: 'SELLSY-EXP-001',
      expert_comptable_nom: 'DURAND',
      expert_comptable_prenom: 'Camille',
      chef_de_mission: 'SELLSY-CDM-014',
      chef_de_mission_nom: 'MARTIN',
      chef_de_mission_prenom: 'Alexandre',
    };

    // Bloc lab_dossier (reprend le shape existant LabDossierBloc)
    this.lab = {
      id: 42,
      code_client: code,
      statut_dossier: 'Actif',
      niveau_risque: 'Moyen',
      vigilance: 'Renforcee',
      id_responsable_lab: 'SELLSY-LAB-003',
      responsable_lab_nom: 'LEFEVRE',
      responsable_lab_prenom: 'Sophie',
      date_entree_relation: '2023-04-12',
      date_derniere_revue: '2025-10-28',
      date_prochaine_revue: '2026-10-28',
      periodicite_revue_mois: 12,
      statut_kyc: 'Incomplet',
      date_creation: '2023-04-12',
      date_modification: '2026-03-14',
      cree_par: 'Sophie LEFEVRE',
      modifie_par: 'Alexandre MARTIN',
      nb_evenements_ouverts: 2,
      nb_diligences_retard: 1,
    };

    this.kyc = {
      categorie_client: 'Personne_morale',
      pays_residence_fiscale: 'France',
      pays_implantation: 'France',
      pays_a_risque: ['Émirats arabes unis'],
      secteur_sensible: true,
      secteurs: ['Conseil', 'Intermédiation', 'Services numériques'],
      pep_statut: 'Inconnu',
      pep_details: 'PEP non confirmé (vérification à finaliser).',
      origine_fonds_requise: true,
      origine_fonds_statut: 'A_renseigner',
      complexite_structure: 'Moyenne',
      justification_complexite: 'Holding + filiale à l’étranger ; flux intra-groupe.',
      exposition_sanctions: 'Non',
      notes: 'Points d’attention: sous-traitants hors UE, paiements récurrents en devises.',
    };

    this.beneficiaires = [
      {
        id: 'be-1',
        nom: 'DUPONT',
        prenom: 'Jean',
        type: 'Personne_physique',
        nationalite: 'Française',
        pays_residence: 'France',
        pourcentage: 52,
        mode_controle: 'Detention_capital',
        pep_statut: 'Non',
        sanctions_gel: 'Non',
        commentaire: 'Actionnaire principal.',
      },
      {
        id: 'be-2',
        nom: 'NOVA HOLDING',
        prenom: null,
        type: 'Personne_morale',
        nationalite: null,
        pays_residence: 'Émirats arabes unis',
        pourcentage: 33,
        mode_controle: 'Droits_vote',
        pep_statut: 'Inconnu',
        sanctions_gel: 'Inconnu',
        commentaire: 'Vérifier l’UBO de la holding.',
      },
      {
        id: 'be-3',
        nom: 'MARTIN',
        prenom: 'Claire',
        type: 'Personne_physique',
        nationalite: 'Française',
        pays_residence: 'France',
        pourcentage: 15,
        mode_controle: 'Detention_capital',
        pep_statut: 'Non',
        sanctions_gel: 'Non',
        commentaire: null,
      },
    ];

    this.pieces = [
      {
        id: 'p-1',
        type_piece: 'KBIS',
        titulaire: 'Client',
        statut: 'Perimee',
        date_delivrance: '2025-01-10',
        date_echeance: '2026-01-10',
        reference: 'kbis_acme_2025.pdf',
        commentaire: 'KBIS à renouveler (échue).',
      },
      {
        id: 'p-2',
        type_piece: 'Statuts',
        titulaire: 'Client',
        statut: 'Recue',
        date_delivrance: '2023-02-08',
        date_echeance: null,
        reference: 'statuts_acme_signed.pdf',
        commentaire: null,
      },
      {
        id: 'p-3',
        type_piece: 'Pièce d’identité',
        titulaire: 'BE',
        statut: 'Manquante',
        date_delivrance: null,
        date_echeance: null,
        reference: null,
        commentaire: 'BE Nova Holding: UBO non documenté.',
      },
      {
        id: 'p-4',
        type_piece: 'Organigramme',
        titulaire: 'Client',
        statut: 'Recue',
        date_delivrance: '2026-02-20',
        date_echeance: '2027-02-20',
        reference: 'org_acme_2026.png',
        commentaire: 'Organigramme fourni (à valider).',
      },
    ];

    this.evenements = [
      {
        id: 'e-1',
        type: 'PIECE_PERIMEE',
        date_creation: '2026-01-15',
        criticite: 'Moyenne',
        statut: 'Ouvert',
        responsable: 'Sophie LEFEVRE',
        echeance: '2026-05-15',
        resume: 'KBIS périmé: demander un extrait à jour.',
      },
      {
        id: 'e-2',
        type: 'CHANGEMENT_KYC',
        date_creation: '2026-03-14',
        criticite: 'Elevee',
        statut: 'En_cours',
        responsable: 'Alexandre MARTIN',
        echeance: '2026-05-05',
        resume: 'Nouveau pays d’implantation déclaré pour une filiale (hors UE).',
      },
      {
        id: 'e-3',
        type: 'REVUE_ANNUELLE',
        date_creation: '2025-10-28',
        criticite: 'Faible',
        statut: 'Cloture',
        responsable: 'Sophie LEFEVRE',
        echeance: null,
        resume: 'Revue annuelle 2025 clôturée.',
      },
    ];

    this.diligences = [
      {
        id: 'd-1',
        evenement_id: 'e-1',
        intitule: 'Demander KBIS à jour',
        type_diligence: 'Manuelle',
        responsable: 'Alexandre MARTIN',
        statut: 'A_faire',
        date_echeance: '2026-04-10',
        preuve: null,
        commentaire: 'Relancer le client si pas de retour sous 7 jours.',
      },
      {
        id: 'd-2',
        evenement_id: 'e-2',
        intitule: 'Qualifier le pays à risque et justifier la relation',
        type_diligence: 'Renforcee',
        responsable: 'Sophie LEFEVRE',
        statut: 'En_cours',
        date_echeance: '2026-05-05',
        preuve: 'note_analyse_pays_risque.docx',
        commentaire: 'Analyse initiale rédigée, attente validation.',
      },
      {
        id: 'd-3',
        evenement_id: 'e-3',
        intitule: 'Mettre à jour le questionnaire de revue',
        type_diligence: 'Standard',
        responsable: 'Sophie LEFEVRE',
        statut: 'Realisee',
        date_echeance: '2025-10-28',
        preuve: 'revue_2025.pdf',
        commentaire: null,
      },
    ];

    this.revues = [
      {
        id: 'r-2025',
        date: '2025-10-28',
        responsable: 'Sophie LEFEVRE',
        statut: 'Cloturee',
        conclusion: 'Maintien du niveau de risque (Moyen).',
        prochain_rdv: '2026-10-28',
      },
      {
        id: 'r-2026',
        date: '2026-10-28',
        responsable: 'Sophie LEFEVRE',
        statut: 'En_cours',
        conclusion: null,
        prochain_rdv: null,
      },
    ];

    this.risqueHistorique = [
      {
        id: 'rh-1',
        date: '2024-10-25',
        niveau: 'Faible',
        origine: 'Calcul_auto',
        justification: null,
        utilisateur: 'Sophie LEFEVRE',
      },
      {
        id: 'rh-2',
        date: '2025-10-28',
        niveau: 'Moyen',
        origine: 'Calcul_auto',
        justification: 'Exposition à un secteur jugé sensible + pièces manquantes.',
        utilisateur: 'Sophie LEFEVRE',
      },
      {
        id: 'rh-3',
        date: '2026-03-14',
        niveau: 'Moyen',
        origine: 'Override_manuel',
        justification: 'Override temporaire en attendant documents UBO holding.',
        utilisateur: 'Alexandre MARTIN',
      },
    ];

    this.audit = [
      {
        id: 'a-1',
        date: '2026-03-14 09:42',
        utilisateur: 'Alexandre MARTIN',
        action: 'MODIF_KYC',
        entite: 'lab_kyc',
        details: 'Mise à jour pays à risque + notes.',
      },
      {
        id: 'a-2',
        date: '2026-01-15 15:10',
        utilisateur: 'Sophie LEFEVRE',
        action: 'CREATION_EVENEMENT',
        entite: 'lab_evenements',
        details: 'Création événement PIECE_PERIMEE (KBIS).',
      },
      {
        id: 'a-3',
        date: '2025-10-28 11:03',
        utilisateur: 'Sophie LEFEVRE',
        action: 'CLOTURE_REVUE',
        entite: 'lab_revues',
        details: 'Revue annuelle clôturée; prochaine échéance calculée.',
      },
    ];
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

  getPepTone(value: 'Oui' | 'Non' | 'Inconnu'): LabBadgeTone {
    if (value === 'Oui') return 'danger';
    if (value === 'Inconnu') return 'warn';
    return 'ok';
  }

  getSanctionsTone(value: 'Oui' | 'Non' | 'Inconnu'): LabBadgeTone {
    if (value === 'Oui') return 'danger';
    if (value === 'Inconnu') return 'warn';
    return 'ok';
  }

  getEvenementTone(value: LabEvenement['criticite']): LabBadgeTone {
    if (value === 'Elevee') return 'danger';
    if (value === 'Moyenne') return 'warn';
    return 'neutral';
  }

  getDiligenceTone(value: LabDiligence['statut']): LabBadgeTone {
    if (value === 'A_faire') return 'warn';
    if (value === 'En_cours') return 'info';
    if (value === 'Abandonnee') return 'neutral';
    return 'ok';
  }

  /** Tag origine plan de vigilance (lecture seule). */
  getDiligenceOrigineLabel(d: LabDiligence): string {
    const t = d.type_diligence != null ? String(d.type_diligence).trim() : '';
    if (t === 'Standard') return 'standard';
    if (t === 'Renforcee') return 'renforcée';
    return 'manuelle';
  }

  getDiligenceOrigineClass(d: LabDiligence): string {
    const t = d.type_diligence != null ? String(d.type_diligence).trim() : '';
    if (t === 'Standard') return 'tag-origine tag-origine--standard';
    if (t === 'Renforcee') return 'tag-origine tag-origine--renforcee';
    return 'tag-origine tag-origine--manuelle';
  }

  /** Scroll fluide vers une section de la fiche (accès rapides). */
  scrollToSection(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  getAuditActionLabel(action: string | null | undefined): string {
    const key = action != null ? String(action).trim() : '';
    const labels: Record<string, string> = {
      CREATION_DOSSIER: 'Création du dossier',
      MODIF_DOSSIER: 'Modification du dossier',
      MODIF_CLIENT: 'Modification du client',
      CREATION_KYC: 'Création KYC',
      MODIF_KYC: 'Modification KYC',
      CREATION_BE: 'Ajout d’un bénéficiaire effectif',
      MODIF_BE: 'Modification d’un bénéficiaire effectif',
      SUPPRESSION_BE: 'Suppression d’un bénéficiaire effectif',
      CREATION_PIECE: 'Ajout d’une pièce',
      MODIF_PIECE: 'Modification d’une pièce',
      SUPPRESSION_PIECE: 'Suppression d’une pièce',
      CHANGEMENT_RISQUE: 'Changement de risque',
      GENERATION_PLAN_VIGILANCE: 'Génération du plan de vigilance',
      CREATION_EVENEMENT: 'Création d’un événement',
      CLOTURE_EVENEMENT: 'Clôture d’un événement',
      CREATION_DILIGENCE: 'Création d’une diligence',
      CLOTURE_DILIGENCE: 'Clôture d’une diligence',
      CREATION_REVUE: 'Lancement d’une revue',
      CLOTURE_REVUE: 'Clôture d’une revue',
      ANNULATION_REVUE: 'Annulation d’une revue',
      ACTION_LAB: 'Action LAB',
    };
    return labels[key] || this.humanizeCode(key) || 'Action';
  }

  getAuditEntityLabel(entite: string | null | undefined): string {
    const raw = entite != null ? String(entite).trim() : '';
    if (!raw) return '';
    const match = raw.match(/^(lab_[a-z0-9_]+)\s*#?\s*(\d+)?$/i);
    const table = match?.[1] ?? raw.split(/\s+/)[0];
    const id = match?.[2] ?? (raw.includes('#') ? raw.split('#').pop()?.trim() : undefined);
    const tableLabels: Record<string, string> = {
      lab_dossier: 'Dossier',
      lab_kyc: 'KYC',
      lab_evenements: 'Événement',
      lab_diligences: 'Diligence',
      lab_revues: 'Revue',
      lab_pieces_kyc: 'Pièce',
      lab_beneficiaires_effectifs: 'Bénéficiaire effectif',
      lab_arpec_evaluations: 'Évaluation ARPEC',
      clients: 'Client',
      lab: 'LAB',
    };
    const label = tableLabels[table] || this.humanizeCode(table);
    return id ? `${label} n°${id}` : label;
  }

  getAuditDetailsLabel(details: string | null | undefined): string {
    const raw = details != null ? String(details).trim() : '';
    if (!raw || raw === 'Action journalisée') return '';

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parts: string[] = [];
        for (const [key, value] of Object.entries(parsed)) {
          if (value == null || value === '') continue;
          if (typeof value === 'object') continue;
          const field = this.auditDetailFieldLabel(key);
          const formatted = this.auditDetailValueLabel(key, value);
          if (field && formatted) parts.push(`${field} : ${formatted}`);
        }
        if (parts.length) return parts.join(' · ');
      }
    } catch {
      // texte libre
    }

    return raw;
  }

  private auditDetailFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      type_evenement: 'Type',
      libelle: 'Libellé',
      criticite: 'Criticité',
      statut: 'Statut',
      intitule: 'Intitulé',
      type_diligence: 'Origine',
      date_echeance: 'Échéance',
      niveau_risque: 'Niveau de risque',
      vigilance: 'Vigilance',
      modulation: 'Modulation',
      type_revue: 'Type de revue',
      nb_creees: 'Diligences créées',
      nb_sautees: 'Déjà présentes',
      id_evaluation: 'Évaluation',
      motif_cloture: 'Motif de clôture',
      conclusion_risque: 'Conclusion',
    };
    return labels[key] || this.humanizeCode(key);
  }

  private auditDetailValueLabel(key: string, value: unknown): string {
    const text = String(value).trim();
    if (!text) return '';

    const valueLabels: Record<string, string> = {
      AUTRE: 'Autre',
      PIECE_MANQUANTE: 'Pièce manquante',
      PIECE_PERIMEE: 'Pièce périmée',
      CHANGEMENT_KYC: 'Changement KYC',
      CHANGEMENT_BE: 'Changement BE',
      CHANGEMENT_RISQUE: 'Changement de risque',
      TRANSACTION_ATYPIQUE: 'Transaction atypique',
      REVUE_ANNUELLE: 'Revue annuelle',
      PLAN_VIGILANCE: 'Plan de vigilance',
      ENTREE_RELATION: 'Entrée en relation',
      Ouvert: 'Ouvert',
      Cloture: 'Clôturé',
      En_cours: 'En cours',
      A_faire: 'À faire',
      Realisee: 'Réalisée',
      Abandonnee: 'Abandonnée',
      Moyenne: 'Moyenne',
      Elevee: 'Élevée',
      Faible: 'Faible',
      Standard: 'Standard',
      Renforcee: 'Renforcée',
      Manuelle: 'Manuelle',
      Annuelle: 'Annuelle',
      Hausse: 'Hausse',
      Baisse: 'Baisse',
      Conforme: 'Conforme',
      Élevé: 'Élevé',
      Eleve: 'Élevé',
    };

    if (key === 'type_diligence' || key === 'vigilance' || key === 'criticite' || key === 'statut' || key === 'type_evenement' || key === 'modulation' || key === 'niveau_risque' || key === 'type_revue') {
      return valueLabels[text] || this.humanizeCode(text);
    }
    return valueLabels[text] || text;
  }

  private humanizeCode(code: string): string {
    const clean = String(code || '').trim();
    if (!clean) return '';
    return clean
      .replace(/^lab_/i, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  isDiligenceLate(d: LabDiligence): boolean {
    if (!d.date_echeance) return false;
    if (d.statut === 'Realisee' || d.statut === 'Abandonnee') return false;
    const due = new Date(d.date_echeance);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const b = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    return b < a;
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

  // ===== Indicateurs "présentation" =====

  getBeneficiairesTotalPct(): number {
    const total = this.beneficiaires
      .map((b) => (typeof b.pourcentage === 'number' ? b.pourcentage : 0))
      .reduce((a, b) => a + b, 0);
    return Math.round(total * 10) / 10;
  }

  getBeneficiairePrincipalPct(): number {
    if (!this.beneficiaires.length) return 0;
    const first = this.beneficiaires[0];
    return typeof first.pourcentage === 'number' ? first.pourcentage : 0;
  }

  getBeneficiairesHasUnknown(): boolean {
    return this.beneficiaires.some((b) => b.pep_statut === 'Inconnu' || b.sanctions_gel === 'Inconnu');
  }

  getPiecesCounts(): { recue: number; manquante: number; perimee: number; non_requise: number; total: number } {
    const total = this.pieces.length;
    const recue = this.pieces.filter((p) => p.statut === 'Recue').length;
    const manquante = this.pieces.filter((p) => p.statut === 'Manquante').length;
    const perimee = this.pieces.filter((p) => p.statut === 'Perimee').length;
    const non_requise = this.pieces.filter((p) => p.statut === 'Non_requise').length;
    return { recue, manquante, perimee, non_requise, total };
  }

  /**
   * Donut chart (SVG) : calcule la longueur du segment principal (en % du périmètre).
   * Utilisé pour la part du BE principal ou la complétude (simple, lisible, sans libs).
   */
  donutDasharray(part: number, total: number): string {
    if (!total || total <= 0) return '0 100';
    const p = Math.max(0, Math.min(100, (part / total) * 100));
    const a = Math.round(p * 10) / 10;
    const b = Math.round((100 - a) * 10) / 10;
    return `${a} ${b}`;
  }

  // ===== Plan & suivi — revue, événements, diligences =====

  get evenementsBloquantsRevue(): LabEvenement[] {
    return this.evenements.filter(
      (e) =>
        e.type !== 'REVUE_ANNUELLE' &&
        (e.statut === 'Ouvert' || e.statut === 'En_cours'),
    );
  }

  get canLancerRevue(): boolean {
    return !this.revueEnCours && this.evenementsBloquantsRevue.length === 0 && !this.actionBusy;
  }

  get lancerRevueDisabledReason(): string | null {
    if (this.revueEnCours) {
      return 'Une revue est déjà en cours — reprenez-la ou annulez-la depuis le wizard.';
    }
    if (this.evenementsBloquantsRevue.length > 0) {
      return 'Clôturez d\'abord les événements ouverts (hors revue annuelle) avant de lancer une revue.';
    }
    return null;
  }

  isEvenementEditable(e: LabEvenement): boolean {
    return e.statut !== 'Cloture' && e.type !== 'REVUE_ANNUELLE';
  }

  isEvenementOpen(e: LabEvenement): boolean {
    return e.statut === 'Ouvert' || e.statut === 'En_cours';
  }

  getDiligencesForEvenement(eventId: string): LabDiligence[] {
    return this.diligences.filter((d) => d.evenement_id === eventId);
  }

  allowedDiligenceStatuts(current: string): string[] {
    return DILIGENCE_TRANSITIONS[current] ?? [current];
  }

  diligenceStatutLabel(statut: string): string {
    return DILIGENCE_STATUT_LABELS[statut] ?? statut;
  }

  getEvenementTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      PIECE_MANQUANTE: 'Pièce manquante',
      PIECE_PERIMEE: 'Pièce périmée',
      CHANGEMENT_KYC: 'Changement KYC',
      TRANSACTION_ATYPIQUE: 'Transaction atypique',
      AUTRE: 'Autre',
      REVUE_ANNUELLE: 'Revue annuelle',
      ENTREE_RELATION: 'Entrée en relation',
      CHANGEMENT_BE: 'Changement BE',
      CHANGEMENT_RISQUE: 'Changement risque',
    };
    return labels[type] ?? type;
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

  openCreateEvenementModal(): void {
    this.actionError = null;
    this.selectedEvenement = null;
    this.evenementForm = {
      type_evenement: 'AUTRE',
      libelle: '',
      criticite: 'Moyenne',
      statut: 'Ouvert',
      date_echeance: '',
      conclusion: '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      diligence_intitule: '',
      diligence_echeance: '',
    };
    this.evenementModalMode = 'create';
  }

  openEditEvenementModal(e: LabEvenement): void {
    if (!this.isEvenementEditable(e)) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      type_evenement: 'AUTRE',
      libelle: e.resume ?? '',
      criticite: e.criticite,
      statut: e.statut === 'En_cours' ? 'En_cours' : 'Ouvert',
      date_echeance: e.echeance ? e.echeance.slice(0, 10) : '',
      conclusion: '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      diligence_intitule: '',
      diligence_echeance: '',
    };
    this.evenementModalMode = 'edit';
  }

  openCloseEvenementModal(e: LabEvenement): void {
    if (!this.isEvenementEditable(e)) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      ...this.evenementForm,
      conclusion: '',
      tracfin_declare: '',
      tracfin_commentaire: '',
    };
    this.evenementModalMode = 'close';
  }

  closeEvenementModal(): void {
    this.evenementModalMode = null;
    this.selectedEvenement = null;
  }

  saveEvenementModal(): void {
    const code = this.client?.code_client || this.codeClient;
    if (!code || this.actionBusy) return;

    this.actionBusy = true;
    this.actionError = null;

    if (this.evenementModalMode === 'create') {
      const body: LabCreateEvenementRequest = {
        code_client: code,
        type_evenement: this.evenementForm.type_evenement,
        libelle: this.evenementForm.libelle.trim() || undefined,
        criticite: this.evenementForm.criticite,
        date_echeance: this.evenementForm.date_echeance.trim() || null,
        id_responsable: this.lab?.id_responsable_lab ?? undefined,
      };
      const dilIntitule = this.evenementForm.diligence_intitule.trim();
      if (dilIntitule) {
        body.diligences = [{
          intitule: dilIntitule,
          date_echeance: this.evenementForm.diligence_echeance.trim() || null,
          type_diligence: 'Manuelle',
        }];
      }
      this.labService.createEvenementLab(body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
      return;
    }

    if (this.evenementModalMode === 'edit' && this.selectedEvenement) {
      const body: LabUpdateEvenementRequest = {
        libelle: this.evenementForm.libelle.trim() || undefined,
        criticite: this.evenementForm.criticite,
        statut: this.evenementForm.statut,
        date_echeance: this.evenementForm.date_echeance.trim() || null,
      };
      this.labService.updateEvenementLab(this.selectedEvenement.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
      return;
    }

    if (this.evenementModalMode === 'close' && this.selectedEvenement) {
      const conclusion = this.evenementForm.conclusion.trim();
      if (!conclusion) {
        this.actionBusy = false;
        this.actionError = 'La conclusion est obligatoire pour clôturer l\'événement.';
        return;
      }
      const body: LabCloturerEvenementRequest = { conclusion };
      if (this.selectedEvenement.type === 'TRANSACTION_ATYPIQUE') {
        body.tracfin_declare = this.evenementForm.tracfin_declare || undefined;
        body.tracfin_commentaire = this.evenementForm.tracfin_commentaire.trim() || null;
      }
      this.labService.cloturerEvenementLab(this.selectedEvenement.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
    }
  }

  openCreateDiligenceModal(e: LabEvenement): void {
    if (!this.isEvenementOpen(e)) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.selectedDiligence = null;
    this.diligenceForm = {
      intitule: '',
      statut: 'A_faire',
      date_echeance: '',
      commentaires: '',
      ref_piece_jointe: '',
      motif_abandon: '',
    };
    this.diligenceModalMode = 'create';
  }

  openEditDiligenceModal(d: LabDiligence): void {
    if (d.statut === 'Realisee' || d.statut === 'Abandonnee') return;
    this.actionError = null;
    this.selectedDiligence = d;
    this.selectedEvenement = this.evenements.find((e) => e.id === d.evenement_id) ?? null;
    this.diligenceForm = {
      intitule: d.intitule,
      statut: d.statut,
      date_echeance: d.date_echeance ? d.date_echeance.slice(0, 10) : '',
      commentaires: d.commentaire ?? '',
      ref_piece_jointe: d.preuve ?? '',
      motif_abandon: '',
    };
    this.diligenceModalMode = 'edit';
  }

  closeDiligenceModal(): void {
    this.diligenceModalMode = null;
    this.selectedDiligence = null;
    this.selectedEvenement = null;
  }

  saveDiligenceModal(): void {
    if (this.actionBusy) return;

    this.actionBusy = true;
    this.actionError = null;

    if (this.diligenceModalMode === 'create' && this.selectedEvenement) {
      const intitule = this.diligenceForm.intitule.trim();
      if (!intitule) {
        this.actionBusy = false;
        this.actionError = 'L\'intitulé de la diligence est obligatoire.';
        return;
      }
      const body: LabCreateDiligenceRequest = {
        id_evenement: this.selectedEvenement.id,
        intitule,
        type_diligence: 'Manuelle',
        date_echeance: this.diligenceForm.date_echeance.trim() || null,
        id_responsable: this.lab?.id_responsable_lab ?? undefined,
      };
      this.labService.createDiligenceLab(body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeDiligenceModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
      return;
    }

    if (this.diligenceModalMode === 'edit' && this.selectedDiligence) {
      const body: LabUpdateDiligenceRequest = {
        statut: this.diligenceForm.statut,
        date_echeance: this.diligenceForm.date_echeance.trim() || null,
        commentaires: this.diligenceForm.commentaires.trim() || null,
        ref_piece_jointe: this.diligenceForm.ref_piece_jointe.trim() || null,
      };
      if (this.diligenceForm.statut === 'Abandonnee') {
        body.motif_abandon = this.diligenceForm.motif_abandon.trim() || undefined;
      }
      this.labService.updateDiligenceLab(this.selectedDiligence.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeDiligenceModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
    }
  }

  get evenementModalTitle(): string {
    if (this.evenementModalMode === 'create') return 'Créer un événement';
    if (this.evenementModalMode === 'edit') return 'Modifier l\'événement';
    if (this.evenementModalMode === 'close') return 'Clôturer l\'événement';
    return '';
  }

  get diligenceModalTitle(): string {
    if (this.diligenceModalMode === 'create') return 'Ajouter une diligence';
    if (this.diligenceModalMode === 'edit') return 'Modifier la diligence';
    return '';
  }

  // ===== Bénéficiaires effectifs — modals CRUD =====

  private resetBeneficiaireForm(): void {
    this.beneficiaireForm = {
      nom: '',
      prenom: '',
      nationalite: '',
      pays_residence: '',
      pourcentage: '',
      mode_controle: 'Detention_capital',
      pep_statut: 'Non',
      sanctions_gel: 'Non',
      commentaire: '',
    };
  }

  private mapBeneficiaireFormToBody(): LabUpdateBeneficiaireRequest {
    const pct = String(this.beneficiaireForm.pourcentage ?? '').trim();
    return {
      nom: this.beneficiaireForm.nom.trim(),
      prenom: this.beneficiaireForm.prenom.trim() || null,
      nationalite: this.beneficiaireForm.nationalite.trim() || null,
      pays_residence: this.beneficiaireForm.pays_residence.trim() || null,
      pourcentage: pct ? Number(pct) : null,
      mode_controle: this.beneficiaireForm.mode_controle || 'Autre',
      pep_statut: this.beneficiaireForm.pep_statut || 'Non',
      sanctions_gel: this.beneficiaireForm.sanctions_gel || 'Non',
      commentaire: this.beneficiaireForm.commentaire.trim() || null,
      options: { creer_evenement_changement_be: true },
    };
  }

  openCreateBeneficiaireModal(): void {
    this.actionError = null;
    this.selectedBeneficiaire = null;
    this.resetBeneficiaireForm();
    this.beneficiaireModalMode = 'create';
  }

  openEditBeneficiaireModal(b: LabBeneficiaireEffectif): void {
    this.actionError = null;
    this.selectedBeneficiaire = b;
    this.beneficiaireForm = {
      nom: b.nom ?? '',
      prenom: b.prenom ?? '',
      nationalite: b.nationalite ?? '',
      pays_residence: b.pays_residence ?? '',
      pourcentage: b.pourcentage != null ? String(b.pourcentage) : '',
      mode_controle: b.mode_controle || 'Autre',
      pep_statut: b.pep_statut || 'Non',
      sanctions_gel: b.sanctions_gel || 'Non',
      commentaire: b.commentaire ?? '',
    };
    this.beneficiaireModalMode = 'edit';
  }

  closeBeneficiaireModal(): void {
    this.beneficiaireModalMode = null;
    this.selectedBeneficiaire = null;
  }

  saveBeneficiaireModal(): void {
    const code = this.client?.code_client || this.codeClient;
    if (!code || this.actionBusy) return;

    const nom = this.beneficiaireForm.nom.trim();
    if (!nom) {
      this.actionError = 'Le nom est obligatoire pour le bénéficiaire effectif.';
      return;
    }

    this.actionBusy = true;
    this.actionError = null;

    if (this.beneficiaireModalMode === 'create') {
      const body: LabCreateBeneficiaireRequest = {
        code_client: code,
        ...this.mapBeneficiaireFormToBody(),
      };
      this.labService.createBeneficiaireLab(body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeBeneficiaireModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
      return;
    }

    if (this.beneficiaireModalMode === 'edit' && this.selectedBeneficiaire) {
      this.labService.updateBeneficiaireLab(this.selectedBeneficiaire.id, this.mapBeneficiaireFormToBody()).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeBeneficiaireModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
    }
  }

  deleteBeneficiaire(b: LabBeneficiaireEffectif): void {
    if (this.actionBusy) return;
    const label = [b.prenom, b.nom].filter(Boolean).join(' ') || b.nom;
    if (!confirm(`Supprimer le bénéficiaire effectif « ${label} » ?`)) return;

    this.actionBusy = true;
    this.actionError = null;
    this.labService.deleteBeneficiaireLab(b.id).subscribe({
      next: () => {
        this.actionBusy = false;
        this.loadDossier();
      },
      error: (err) => {
        this.actionBusy = false;
        this.actionError = this.formatApiError(err);
      },
    });
  }

  get beneficiaireModalTitle(): string {
    if (this.beneficiaireModalMode === 'create') return 'Ajouter un bénéficiaire effectif';
    if (this.beneficiaireModalMode === 'edit') return 'Modifier le bénéficiaire effectif';
    return '';
  }

  // ===== Pièces KYC — modals CRUD =====

  private resetPieceForm(): void {
    this.pieceForm = {
      type_piece: '',
      titulaire: 'Client',
      statut: 'Manquante',
      date_delivrance: '',
      date_echeance: '',
      reference: '',
      commentaire: '',
    };
    this.pendingPieceFile = null;
  }

  private guessPieceTypeFromFilename(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.includes('kbis') || lower.includes('insee')) return 'KBIS';
    if (lower.includes('statut')) return 'Statuts';
    if (lower.includes('identit') || lower.includes('cni') || lower.includes('passeport')) {
      return 'Pièce d\'identité';
    }
    if (lower.includes('domicil')) return 'Justificatif domicile';
    if (lower.includes('organigramme') || lower.includes('detention')) return 'Organigramme';
    if (lower.includes('rib') || lower.includes('iban')) return 'RIB';
    return '';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  get pendingPieceFileLabel(): string {
    if (!this.pendingPieceFile) return '';
    return `${this.pendingPieceFile.name} (${this.formatFileSize(this.pendingPieceFile.size)})`;
  }

  triggerPieceFilePicker(): void {
    this.pieceFileInput?.nativeElement.click();
  }

  onPieceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.pendingPieceFile = file;
    this.pieceForm.reference = file.name;
    if (!this.pieceForm.type_piece.trim()) {
      this.pieceForm.type_piece = this.guessPieceTypeFromFilename(file.name);
    }
    if (this.pieceModalMode === 'create') {
      this.pieceForm.statut = 'Recue';
    }
    if (this.pieceModalMode === null) {
      this.openCreatePieceModalFromFile();
    }
  }

  private openCreatePieceModalFromFile(): void {
    this.actionError = null;
    this.selectedPiece = null;
    this.pieceModalMode = 'create';
  }

  private mapPieceFormToBody(): LabUpdatePieceRequest {
    return {
      type_piece: this.pieceForm.type_piece.trim(),
      titulaire: this.pieceForm.titulaire || 'Client',
      statut: this.pieceForm.statut || 'Manquante',
      date_delivrance: this.pieceForm.date_delivrance.trim() || null,
      date_echeance: this.pieceForm.date_echeance.trim() || null,
      reference: this.pieceForm.reference.trim() || null,
      commentaire: this.pieceForm.commentaire.trim() || null,
    };
  }

  openCreatePieceModal(): void {
    this.resetPieceForm();
    this.triggerPieceFilePicker();
  }

  openEditPieceModal(p: LabPieceKyc): void {
    this.actionError = null;
    this.selectedPiece = p;
    this.pendingPieceFile = null;
    this.pieceForm = {
      type_piece: p.type_piece ?? '',
      titulaire: p.titulaire || 'Client',
      statut: p.statut || 'Manquante',
      date_delivrance: p.date_delivrance ? p.date_delivrance.slice(0, 10) : '',
      date_echeance: p.date_echeance ? p.date_echeance.slice(0, 10) : '',
      reference: p.reference ?? '',
      commentaire: p.commentaire ?? '',
    };
    this.pieceModalMode = 'edit';
  }

  closePieceModal(): void {
    this.pieceModalMode = null;
    this.selectedPiece = null;
    this.pendingPieceFile = null;
  }

  private buildPieceBodyFromForm(
    upload?: { nom_fichier: string; filepath: string } | null,
  ): LabUpdatePieceRequest {
    const body: LabUpdatePieceRequest = {
      ...this.mapPieceFormToBody(),
    };
    if (upload) {
      body.nom_fichier = upload.nom_fichier;
      body.filepath = upload.filepath;
      body.reference = upload.nom_fichier;
      body.statut = body.statut === 'Manquante' ? 'Recue' : body.statut;
    }
    return body;
  }

  private uploadPendingPieceFileIfNeeded(code: string) {
    if (!this.pendingPieceFile) {
      return this.labService.createPieceLab({
        code_client: code,
        ...this.mapPieceFormToBody(),
      });
    }
    return this.labService.uploadPieceKycFile(code, this.pendingPieceFile).pipe(
      switchMap((uploadRes) => {
        const upload = uploadRes.data;
        return this.labService.createPieceLab({
          code_client: code,
          ...this.buildPieceBodyFromForm(upload),
        });
      }),
    );
  }

  private uploadPendingPieceFileForUpdateIfNeeded(code: string, pieceId: string) {
    if (!this.pendingPieceFile) {
      return this.labService.updatePieceLab(pieceId, this.mapPieceFormToBody());
    }
    return this.labService.uploadPieceKycFile(code, this.pendingPieceFile).pipe(
      switchMap((uploadRes) => {
        return this.labService.updatePieceLab(pieceId, this.buildPieceBodyFromForm(uploadRes.data));
      }),
    );
  }

  savePieceModal(): void {
    const code = this.client?.code_client || this.codeClient;
    if (!code || this.actionBusy) return;

    const typePiece = this.pieceForm.type_piece.trim();
    if (!typePiece) {
      this.actionError = 'Le type de pièce est obligatoire.';
      return;
    }

    if (this.pieceModalMode === 'create' && !this.pendingPieceFile) {
      this.actionError = 'Sélectionnez un fichier via l\'explorateur.';
      return;
    }

    this.actionBusy = true;
    this.actionError = null;

    if (this.pieceModalMode === 'create') {
      this.uploadPendingPieceFileIfNeeded(code).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closePieceModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
      return;
    }

    if (this.pieceModalMode === 'edit' && this.selectedPiece) {
      this.uploadPendingPieceFileForUpdateIfNeeded(code, this.selectedPiece.id).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closePieceModal();
          this.loadDossier();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
        },
      });
    }
  }

  deletePiece(p: LabPieceKyc): void {
    if (this.actionBusy) return;
    if (!confirm(`Supprimer la pièce « ${p.type_piece} » ?`)) return;

    this.actionBusy = true;
    this.actionError = null;
    this.labService.deletePieceLab(p.id).subscribe({
      next: () => {
        this.actionBusy = false;
        this.loadDossier();
      },
      error: (err) => {
        this.actionBusy = false;
        this.actionError = this.formatApiError(err);
      },
    });
  }

  get pieceModalTitle(): string {
    if (this.pieceModalMode === 'create') return 'Ajouter une pièce KYC';
    if (this.pieceModalMode === 'edit') return 'Modifier la pièce KYC';
    return '';
  }

  // ===== Handlers actions =====

  onAjouterBeneficiaire(): void {
    this.openCreateBeneficiaireModal();
  }

  onAjouterPiece(): void {
    this.openCreatePieceModal();
  }

  onCreerEvenement(): void {
    this.openCreateEvenementModal();
  }
}
