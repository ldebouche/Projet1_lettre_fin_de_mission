import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabEvenementListItem, LabService } from '../../../services/lab-service';

type StatutFilter = '' | 'Ouvert' | 'En_cours' | 'Cloture';
type CriticiteFilter = '' | 'Faible' | 'Moyenne' | 'Elevee';

@Component({
  selector: 'app-lab-evenements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabCarteComponent],
  templateUrl: './lab-evenements.html',
  styleUrls: ['./lab-evenements.scss'],
})
export class LabEvenementsComponent implements OnInit {
  loading = false;
  errorMessage: string | null = null;

  codeClient = '';
  statutFilter: StatutFilter = '';
  criticiteFilter: CriticiteFilter = '';
  idEvenement = '';
  ouvertsOnly = false;
  search = '';

  rows: LabEvenementListItem[] = [];
  total = 0;

  get ouvertsCount(): number {
    return this.rows.filter((r) => r.statut === 'Ouvert' || r.statut === 'En_cours').length;
  }

  get elevesCount(): number {
    return this.rows.filter((r) => r.criticite === 'Elevee').length;
  }

  constructor(
    private labService: LabService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.readQueryParams();
    this.loadEvenements();
  }

  private readQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code_client');
    if (code?.trim()) this.codeClient = code.trim();

    const statut = params.get('statut');
    if (statut === 'Ouvert' || statut === 'En_cours' || statut === 'Cloture') {
      this.statutFilter = statut;
    }

    const criticite = params.get('criticite');
    if (criticite === 'Faible' || criticite === 'Moyenne' || criticite === 'Elevee') {
      this.criticiteFilter = criticite;
    }

    const idEvenement = params.get('id_evenement') || params.get('id');
    if (idEvenement?.trim()) this.idEvenement = idEvenement.trim();

    this.ouvertsOnly = params.get('ouverts') === '1' || params.get('ouverts') === 'true';
  }

  private buildParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.codeClient.trim()) params['code_client'] = this.codeClient.trim();
    if (this.statutFilter) params['statut'] = this.statutFilter;
    if (this.criticiteFilter) params['criticite'] = this.criticiteFilter;
    if (this.idEvenement.trim()) params['id'] = this.idEvenement.trim();
    if (this.ouvertsOnly) params['ouverts'] = '1';
    return params;
  }

  loadEvenements(): void {
    this.loading = true;
    this.errorMessage = null;
    this.labService.getEvenementsLab(this.buildParams()).subscribe({
      next: (res) => {
        const data = res.data || [];
        this.rows = this.applyClientSearch(data);
        this.total = this.rows.length;
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement événements LAB:', err);
        this.errorMessage = 'Impossible de charger les événements du cabinet.';
        this.rows = [];
        this.total = 0;
        this.loading = false;
      },
    });
  }

  private applyClientSearch(data: LabEvenementListItem[]): LabEvenementListItem[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((row) => {
      const haystack = [
        row.client,
        row.code_client,
        row.type_evenement,
        row.libelle,
        row.responsable,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  applyFilters(): void {
    const queryParams: Record<string, string | null> = {
      code_client: this.codeClient.trim() || null,
      statut: this.statutFilter || null,
      criticite: this.criticiteFilter || null,
      id_evenement: this.idEvenement.trim() || null,
      ouverts: this.ouvertsOnly ? '1' : null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: '',
      replaceUrl: true,
    });
    this.loadEvenements();
  }

  clearSearch(): void {
    this.search = '';
    this.applyFilters();
  }

  clearCodeClient(): void {
    this.codeClient = '';
    this.applyFilters();
  }

  clearIdEvenement(): void {
    this.idEvenement = '';
    this.applyFilters();
  }

  clearOuvertsOnly(): void {
    this.ouvertsOnly = false;
    this.applyFilters();
  }

  openPlanSuivi(row: LabEvenementListItem): void {
    if (!row.code_client) return;
    this.router.navigate(['/lab/dossier'], {
      queryParams: { code_client: row.code_client },
    });
  }

  displayValue(value: string | null | undefined): string {
    const v = value != null ? String(value).trim() : '';
    return v || '—';
  }

  criticiteLabel(value: string | null | undefined): string {
    if (value === 'Elevee') return 'Élevée';
    return this.displayValue(value);
  }

  criticiteClass(value: string | null | undefined): string {
    if (value === 'Faible') return 'pill pill--green';
    if (value === 'Moyenne') return 'pill pill--amber';
    if (value === 'Elevee') return 'pill pill--red';
    return 'pill';
  }

  statutLabel(value: string | null | undefined): string {
    if (value === 'En_cours') return 'En cours';
    if (value === 'Cloture') return 'Clôturé';
    return this.displayValue(value);
  }

  statutClass(value: string | null | undefined): string {
    if (value === 'Ouvert') return 'pill pill--amber';
    if (value === 'En_cours') return 'pill pill--blue';
    if (value === 'Cloture') return 'pill pill--green';
    return 'pill';
  }

  typeLabel(value: string | null | undefined): string {
    const v = value != null ? String(value).trim() : '';
    if (!v) return '—';
    return v.replace(/_/g, ' ');
  }
}
