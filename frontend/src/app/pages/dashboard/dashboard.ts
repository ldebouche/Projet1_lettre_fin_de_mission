import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DbService } from '../../services/db-service';
import { DataService } from '../../services/data-service';
import { LabDossierAttenteItem, LabService } from '../../services/lab-service';
import { RolesService } from '../../services/roles-service';
import { ListeHistoriqueComponent } from '../../shared/liste-historique/liste-historique';
import { ModalComponent } from '../../shared/modal/modal';
import { BoutonFiltreComponent } from '../../shared/bouton-filtre/bouton-filtre';
import { RondNotifComponent } from '../../shared/rond-notif/rond-notif';

type SortableField = 'code_client' | '_sortableName' | 'collaborateur' | 'date_sortie';

interface Dossier {
  code_client: string;
  collaborateur?: string;
  _sortableName: string;
  date_sortie?: string | Date | null;
  [key: string]: any;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ListeHistoriqueComponent,
    ModalComponent,
    BoutonFiltreComponent,
    RondNotifComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  collaborateur: any | null = null;

  activeTab: 'mesDossiers' | 'equipe' | 'lab' = 'mesDossiers';

  isLoading = true;
  mesDossiers: Dossier[] = [];
  dossiersEquipe: Dossier[] = [];
  errorMessage: string | null = null;

  nomEntreprise: string = "";
  userRole: string[] = [];

  filterClient: string = '';
  showExitedClients: boolean = false;
  sortField: SortableField = 'code_client';
  sortDirection: 'asc' | 'desc' = 'desc';
  currentPage = 1;
  itemsPerPage = 10;
  readonly Math = Math;
  totalFilteredItems = 0;

  _allMesDossiers: Dossier[] = [];
  _allDossiersEquipe: Dossier[] = [];

  sortLabelMap: { [key in SortableField]: string } = {
    'code_client': 'Code Client',
    '_sortableName': 'Nom du Dossier',
    'collaborateur': 'Collaborateur',
    'date_sortie': 'Date de sortie'
  };

  isHistoriqueModalOpen = false;
  selectedCodeClient: string | null = null;

  dossiersEnAttente: LabDossierAttenteItem[] = [];
  dossiersAttenteTotal = 0;
  dossiersAttenteLoading = false;
  isModalAttenteOpen = false;
  selectedDossierAttente: LabDossierAttenteItem | null = null;

  risqueMap: Map<string, any> = new Map();
  isLabUser: boolean = false;

  constructor(
    private router: Router,
    private db: DbService,
    private labService: LabService,
    private dataService: DataService,
    private rolesService: RolesService
  ) { }

  ngOnInit(): void {
    this.collaborateur = JSON.parse(localStorage.getItem('collaborateur') || 'null');
    this.isLabUser = this.rolesService.hasRoles(this.collaborateur?.groupes_microsoft || [], ['admin', 'informatique', 'lab']);
    this.loadData();
    this.loadDossiersAttente();
  }

  private prepareData(data: any[]): Dossier[] {
    if (!Array.isArray(data)) {
      console.error('prepareData received non-array:', data);
      return [];
    }
    return data.map(d => {
      const formattedName = this.formatNomEntreprise(d);
      const dateSortie = d.date_sortie_cabinet !== "1900-01-01T00:00:00.000Z" ? new Date(d.date_sortie_cabinet) : null;
      return {
        ...d,
        date_sortie: dateSortie,
        _sortableName: formattedName
      } as Dossier;
    });
  }

  loadData() {
    this.isLoading = true;

    if (!this.collaborateur) {
      this.isLoading = false;
      return;
    }

    if (this.collaborateur.statut === 'N1') {
      this.userRole = ['chef'];
    } else {
      this.userRole = ['collaborateur'];
    }

    this.userRole.push(...this.collaborateur.groupes_microsoft);

    this.db.GetListeDossiers(this.collaborateur.id_sellsy, this.userRole).subscribe({
      next: (data: any) => {
        console.log("Dossiers reçus :", data);
        this._allMesDossiers = this.prepareData(data.dossiers);
        this._allDossiersEquipe = this.prepareData(data.dossiersEquipe);
        this.applyFilterAndSort()
        this.loadRisqueLab(this._allMesDossiers);
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = "Erreur lors du chargement des dossiers.";
      }
    });

  }

  private loadRisqueLab(dossiers: Dossier[]) {
    if (!this.isLabUser || !dossiers.length) return;
    const codes = dossiers.map(d => d.code_client);
    this.labService.getDossiersRisqueLab(codes).subscribe({
      next: (res: any) => {
        this.risqueMap = new Map(Object.entries(res.data || {}));
      },
      error: () => {} // silencieux si LAB non dispo
    });
  }

  getRisqueLabel(code_client: string): string {
    return this.risqueMap.get(code_client)?.niveau_risque || 'Non évalué';
  }

  getRisqueClass(code_client: string): string {
    const niveau = this.risqueMap.get(code_client)?.niveau_risque;
    if (niveau === 'Eleve') return 'risque-eleve';
    if (niveau === 'Moyen') return 'risque-moyen';
    if (niveau === 'Faible') return 'risque-faible';
    return 'risque-non-evalue';
  }

  selectTab(tab: 'mesDossiers' | 'equipe' | 'lab') {
    this.activeTab = tab;
    this.currentPage = 1;
    this.filterClient = '';
    this.showExitedClients = false;
    this.applyFilterAndSort();
  }

  getTotalPages(): number {
    const perPage = Math.max(1, this.itemsPerPage);
    return Math.max(1, Math.ceil(this.totalFilteredItems / perPage));
  }

  nextPage() {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.applyFilterAndSort();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.applyFilterAndSort();
    }
  }

  getSortLabel(): string {
    return this.sortLabelMap[this.sortField] || this.sortField;
  }

  setSort(field: SortableField) {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = (field === 'code_client') ? 'asc' : 'desc';
    }
    this.applyFilterAndSort();
  }

  applyFilterAndSort() {
    const isMesDossiersView = this.activeTab === 'mesDossiers' || this.activeTab === 'lab';
    let sourceData = isMesDossiersView ? [...this._allMesDossiers] : [...this._allDossiersEquipe];

    if (this.filterClient) {
      const filterTerm = this.filterClient.toLowerCase();
      sourceData = sourceData.filter(d =>
        (d.code_client && d.code_client.toLowerCase().includes(filterTerm)) ||
        (d._sortableName && d._sortableName.toLowerCase().includes(filterTerm)) ||
        (this.activeTab === 'equipe' && d.collaborateur && d.collaborateur.toLowerCase().includes(filterTerm))
      );
    }

    if (!this.showExitedClients) {
      sourceData = sourceData.filter(d => !d.date_sortie);
    }

    sourceData.sort((a, b) => {
      const isAsc = this.sortDirection === 'asc';

      let aValue: any = a[this.sortField as keyof Dossier] || '';
      let bValue: any = b[this.sortField as keyof Dossier] || '';

      if (this.sortField === 'collaborateur') {
        aValue = (a as any).collaborateur || '';
        bValue = (b as any).collaborateur || '';
      }
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return isAsc ? -1 : 1;
      if (aValue > bValue) return isAsc ? 1 : -1;
      return 0;
    });

    this.totalFilteredItems = sourceData.length;

    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    const paginatedData = sourceData.slice(start, end);

    if (isMesDossiersView) {
      this.mesDossiers = paginatedData;
    } else {
      this.dossiersEquipe = paginatedData;
    }
  }

  getCollabNom(): string {
    return this.collaborateur ? `${this.collaborateur.prenom} ${this.collaborateur.nom}` : '';
  }

  formatNomEntreprise(dossier: any): string {
    const rs = (dossier.raison_sociale || '').trim();
    const forme = (dossier.forme_societe || '').trim();

    if (!rs) {
      return `${(dossier.civilite || '').trim()} ${(dossier.nom || '').trim()} ${(dossier.prenom || '').trim()}`.trim();
    }

    if (forme && rs.toUpperCase().startsWith(forme.toUpperCase())) {
      return rs;
    }

    return `${forme} ${rs}`.trim();
  }

  openDossier(nomEntreprise: string, code_client: string) {
    this.dataService.setNomEntreprise(nomEntreprise);
    this.dataService.setCodeClient(code_client);
    this.router.navigate(['/login-dossier']);
  }

  consulterHistorique(dossier: Dossier) {
    this.selectedCodeClient = dossier.code_client;
    this.isHistoriqueModalOpen = true;
  }

  closeHistoriqueModal() {
    this.isHistoriqueModalOpen = false;
    this.selectedCodeClient = null;
  }

  private loadDossiersAttente(selectFirst = false): void {
    if (!this.collaborateur) {
      this.dossiersEnAttente = [];
      this.dossiersAttenteTotal = 0;
      this.selectedDossierAttente = null;
      return;
    }

    this.dossiersAttenteLoading = true;
    this.labService.getDossiersAttenteLab({ page: 1, pageSize: 200 }).subscribe({
      next: (res) => {
        this.dossiersEnAttente = res.data || [];
        this.dossiersAttenteTotal = res.total ?? this.dossiersEnAttente.length;
        this.dossiersAttenteLoading = false;
        if (selectFirst) {
          this.selectedDossierAttente = this.dossiersEnAttente[0] ?? null;
        }
      },
      error: () => {
        this.dossiersEnAttente = [];
        this.dossiersAttenteTotal = 0;
        this.dossiersAttenteLoading = false;
        this.selectedDossierAttente = null;
      },
    });
  }

  openModalAttente() {
    this.isModalAttenteOpen = true;
    this.loadDossiersAttente(true);
  }

  closeModalAttente() {
    this.isModalAttenteOpen = false;
  }

  selectDossierAttente(d: LabDossierAttenteItem) {
    this.selectedDossierAttente = d;
  }

  openDossierAcceptation() {
    const code = this.selectedDossierAttente?.code_client?.trim();
    if (!code) return;

    this.closeModalAttente();
    void this.router.navigate(['/lab/dossier/formulaire'], {
      queryParams: {
        code_client: code,
        mode: 'acceptation',
        returnTo: '/dashboard',
      },
    });
  }
}
