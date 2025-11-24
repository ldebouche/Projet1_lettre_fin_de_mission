import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DbService } from '../../services/db-service';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DatePipe
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  collaborateur: any | null = JSON.parse(localStorage.getItem('collaborateur') || '');

  activeTab: 'mesDossiers' | 'equipe' = 'mesDossiers';
  
  // --- À CHANGER LORSQUE L'AUTH SERA FAITE ---
  // Mettez 'chef' pour voir les 2 onglets, 'collaborateur' pour n'en voir qu'un.
  userRole: 'collaborateur' | 'chef' = 'chef'; 
  userName: string = 'EC-ABC'; // Simule le code utilisateur
  // ------------------------------------------
  
  isLoading = true;
  mesDossiers: any[] = [];
  dossiersEquipe: any[] = [];
  errorMessage: string | null = null;

  nomEntreprise: string = "";

  constructor(
    private router: Router,
    private db: DbService,
    private dataService: DataService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.isLoading = true;
    if (!this.collaborateur) {
      console.error("Aucun collaborateur trouvé en localStorage.");
      this.isLoading = false;
      return;
    }
    this.db.GetListeDossiers(this.collaborateur.id_sellsy).subscribe({
      next: (data: any) => {
        this.mesDossiers = data;
        this.isLoading = false;
        /*
        if (this.userRole === 'chef') {
          this.dossierService.getDossiersEquipe().subscribe(equipeData => {
            this.dossiersEquipe = equipeData;
            this.isLoading = false;
          });
        } else {
          this.isLoading = false;
        }*/
      },
      error: (err) => {
        this.isLoading = false;
      }
    });
    
  }

  selectTab(tab: 'mesDossiers' | 'equipe') {
    this.activeTab = tab;
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


  // C'est ici que l'on gère le clic vers l'ancien login
  openDossier(nomEntreprise: string, code_client: string) {
    localStorage.setItem('nomEntreprise', nomEntreprise);
    this.dataService.setCodeClient(code_client);
    this.router.navigate(['/login']);
  }
}

