import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DbService } from '../../services/db-service';
import { DataService } from '../../services/data-service';
import { ListeHistoriqueComponent } from '../../shared/liste-historique/liste-historique';
import { ModalComponent } from '../../shared/modal/modal';

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
    ModalComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  collaborateur: any | null = null;

  activeTab: 'mesDossiers' | 'equipe' = 'mesDossiers';
  
  isLoading = true;
  mesDossiers: Dossier[] = []; 
  dossiersEquipe: Dossier[] = [];
  errorMessage: string | null = null;

  nomEntreprise: string = "";
  userRole: string = "";

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

  constructor(
    private router: Router,
    private db: DbService,
    private dataService: DataService
  ) {}

  ngOnInit(): void {
    this.db.VerifCollaborateur().subscribe({
      next: (res) => {
        localStorage.setItem('collaborateur', JSON.stringify(res.collaborateur));
        this.collaborateur = res.collaborateur;
        this.loadData();
      },
      error: (err) => {
        this.errorMessage = "Le code collaborateur est invalide.";
        console.error(err);
      }
    });
  }

  private prepareData(data: any[]): Dossier[] {
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
      console.error("Aucun collaborateur trouvé en localStorage.");
      this.isLoading = false;
      return;
    }

    if (this.collaborateur.statut === 'N1') {
      this.userRole = 'chef';
    } else {
      this.userRole = 'collaborateur';
    }

    this.db.GetListeDossiers(this.collaborateur.id_sellsy, this.collaborateur.statut).subscribe({
      next: (data: any) => {
        this._allMesDossiers = this.prepareData(data.dossiers);
        console.log("Dossiers chargés pour l'utilisateur :", this._allMesDossiers);
        this._allDossiersEquipe = this.prepareData(data.dossiersEquipe);
        this.applyFilterAndSort()
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = "Erreur lors du chargement des dossiers.";
      }
    });
    
  }

  selectTab(tab: 'mesDossiers' | 'equipe') {
    this.activeTab = tab;
    this.currentPage = 1;
    this.filterClient = '';
    this.showExitedClients = false;
    this.applyFilterAndSort();
  }

  getTotalPages(): number {
    return Math.ceil(this.totalFilteredItems / this.itemsPerPage);
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
    let sourceData = this.activeTab === 'mesDossiers' ? [...this._allMesDossiers] : [...this._allDossiersEquipe];

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

    if (this.activeTab === 'mesDossiers') {
        this.mesDossiers = paginatedData;
    } else {
        this.dossiersEquipe = paginatedData;
    }
  }

  addProspect() {
    console.log("Action: Ajout d'un nouveau prospect");
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
}
