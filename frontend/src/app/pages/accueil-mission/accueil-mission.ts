import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DataService } from '../../services/data-service';
import { ModalComponent } from '../../shared/modal/modal';
import { ListeHistoriqueComponent } from '../../shared/liste-historique/liste-historique';
import { DbService } from '../../services/db-service';
import { DashboardService } from '../../services/dashboard-service';
import { RolesService } from '../../services/roles-service';

interface CarteAction {
  label: string;
  route?: string;
  onClick?: () => void;
  visible?: () => boolean;
}

interface CartePrincipale {
  title: string;
  description: string;
  actions: CarteAction[];
  accentColor: 'blue-light' | 'blue-petrol' | 'sand';
  kind?: 'default' | 'lab';
}

@Component({
  selector: 'app-accueil-mission',
  standalone: true,
  imports: [
    CommonModule,
    ListeHistoriqueComponent,
    ModalComponent
  ],
  templateUrl: './accueil-mission.html',
  styleUrls: ['./accueil-mission.scss']
})
export class AccueilMissionComponent implements OnInit {
  collaborateur: any | null = localStorage.getItem('collaborateur') ? JSON.parse(localStorage.getItem('collaborateur')!) : null;
  codeClient: string | null = localStorage.getItem('codeClient');
  nomEntreprise: string = '';
  anneeN1existe: boolean = false;
  millesime: string = '';

  hoverIndex: number | null = null;

  hasRoleLab = false;
  labResumeLoading = false;
  labResumeError = false;
  labResume: any | null = null;

  cartes: CartePrincipale[] = [];

  isHistoriqueModalOpen = false;
  isMissingHistoriqueModalOpen = false;
  selectedCodeClient: string | null = null;

  constructor(
    private router: Router,
    private dataService: DataService,
    private db: DbService,
    private dashboardService: DashboardService,
    private rolesService: RolesService
  ) {
    this.nomEntreprise = this.dataService.getNomEntreprise() || '';
    this.db.GetDossierInfos().subscribe((dossierInfos: any) => {
      this.anneeN1existe = dossierInfos.anneeN1existe;
      this.millesime = dossierInfos.client.anneeN || '';
    });
  }

  ngOnInit(): void {
    this.hasRoleLab = this.rolesService.hasRoles(
      this.collaborateur?.groupes_microsoft || [],
      ['admin', 'informatique', 'lab']
    );

    this.cartes = [
      {
        title: 'Début de mission',
        description: 'Préparer et cadrer le démarrage des missions.',
        accentColor: 'blue-light',
        actions: [
          { label: 'En construction' }
        ]
      },
      {
        title: 'Diligences',
        description: 'Suivre l\'avancement et les contrôles.',
        accentColor: 'blue-petrol',
        actions: [
          { label: 'En construction' }
        ]
      },
      {
        title: 'Fin d\'exercice',
        description: 'Clôturer, documenter et générer les livrables.',
        accentColor: 'sand',
        actions: [
          { label: 'Historique des fichiers pour fin d\'exercice', onClick: () => this.consulterHistorique(), visible: () => true },
          { label: 'Créer la présentation de fin d\'exercice', route: '/lettre-fin-mission', visible: () => this.anneeN1existe },
          { label: 'Générer la lettre de fin d\'exercice', route: '/lettre-fin-mission', visible: () => true }
        ]
      }
    ];

    if (this.hasRoleLab) {
      this.cartes.push({
        title: 'Conformité LAB',
        description: '',
        kind: 'lab',
        accentColor: 'blue-light',
        actions: [
          {
            label: 'Initialiser',
            onClick: () => this.onInitialiserLab(),
            visible: () =>
              !this.labResumeLoading &&
              !this.labResumeError &&
              this.labResume === null
          },
          {
            label: 'Ouvrir le dossier LAB',
            onClick: () => this.openLabDossier()
          }
        ]
      });
      this.loadLabResume();
    }
  }

  private loadLabResume(): void {
    const code = this.codeClient?.trim();
    if (!code) {
      this.labResumeError = true;
      return;
    }
    this.labResumeLoading = true;
    this.labResumeError = false;
    this.db.GetResumeLab(code).subscribe({
      next: (res: { data: any }) => {
        this.labResume = res?.data ?? null;
        this.labResumeLoading = false;
      },
      error: () => {
        this.labResumeLoading = false;
        this.labResumeError = true;
      }
    });
  }

  openLabDossier(): void {
    const code = this.codeClient?.trim();
    if (!code) return;
    this.router.navigate(['/lab/dossier']);
  }

  onInitialiserLab(): void {
    this.openLabDossier();
  }

  getLabRisqueLabel(): string {
    const n = this.labResume?.niveau_risque;
    if (n == null || String(n).trim() === '') return 'Non évalué';
    return String(n).trim();
  }

  getLabRisqueClass(): string {
    const niveau = this.labResume?.niveau_risque != null
      ? String(this.labResume.niveau_risque).trim()
      : '';
    if (niveau === 'Eleve') return 'risque-eleve';
    if (niveau === 'Moyen') return 'risque-moyen';
    if (niveau === 'Faible') return 'risque-faible';
    return 'risque-non-evalue';
  }

  onEnter(i: number) {
    this.hoverIndex = i;
  }

  onLeave() {
    this.hoverIndex = null;
  }

  onAction(action: CarteAction, event: MouseEvent) {
    event.stopPropagation();
    if (action.visible && !action.visible()) {
      return;
    }
    if (action.route) {
      this.verifHistorique(action);
    } else if (action.onClick) {
      action.onClick();
    }
  }

  isActionVisible(action: CarteAction): boolean {
    return !action.visible || action.visible();
  }

  verifHistorique(action: CarteAction): boolean {
    if (!this.codeClient) return false;
    this.dashboardService.checkHistorique(this.codeClient, this.millesime).subscribe({
      next: (result: any) => {
        if (!result) {
          this.openMissingHistoriqueModal();
        }
        else {
          if (action.label === 'Créer la présentation de fin d\'exercice') {
            this.dataService.setModeLFM('presentation');
          } else if (action.label === 'Générer la lettre de fin d\'exercice') {
            this.dataService.setModeLFM('lettre');
          }
          this.router.navigate([action.route]);
        }
      },
      error: (err) => {
        console.error(err);
      }
    });
    return true;
  }

  getAccentColorClass(color: string): string {
    return `accent-${color}`;
  }

  getCollabNom(): string {
    return this.collaborateur ? `${this.collaborateur.prenom} ${this.collaborateur.nom}` : '';
  }

  consulterHistorique() {
    this.selectedCodeClient = this.codeClient;
    this.isHistoriqueModalOpen = true;
  }

  closeHistoriqueModal() {
    this.isHistoriqueModalOpen = false;
    this.selectedCodeClient = null;
  }

  openMissingHistoriqueModal() {
    this.isMissingHistoriqueModalOpen = true;
  }

  closeMissingHistoriqueModal() {
    this.isMissingHistoriqueModalOpen = false;
  }
}
