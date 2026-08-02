import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabDiligenceListItem, LabService } from '../../../services/lab-service';

type StatutFilter = '' | 'A_faire' | 'En_cours' | 'Realisee' | 'Abandonnee';
type RetardFilter = '' | 'late';

@Component({
  selector: 'app-lab-diligences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabCarteComponent],
  templateUrl: './lab-diligences.html',
  styleUrls: ['./lab-diligences.scss'],
})
export class LabDiligencesComponent implements OnInit {
  loading = false;
  errorMessage: string | null = null;

  codeClient = '';
  statutFilter: StatutFilter = '';
  idEvenement = '';
  retardFilter: RetardFilter = '';
  search = '';

  rows: LabDiligenceListItem[] = [];
  total = 0;

  get enRetardCount(): number {
    return this.rows.filter((r) => this.isLate(r)).length;
  }

  get aFaireCount(): number {
    return this.rows.filter((r) => r.statut === 'A_faire' || r.statut === 'En_cours').length;
  }

  constructor(
    private labService: LabService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.readQueryParams();
    this.loadDiligences();
  }

  private readQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code_client');
    if (code?.trim()) this.codeClient = code.trim();

    const statut = params.get('statut');
    if (
      statut === 'A_faire' ||
      statut === 'En_cours' ||
      statut === 'Realisee' ||
      statut === 'Abandonnee'
    ) {
      this.statutFilter = statut;
    }

    const idEvenement = params.get('id_evenement');
    if (idEvenement?.trim()) this.idEvenement = idEvenement.trim();

    if (params.get('retard') === 'late') this.retardFilter = 'late';
  }

  private buildParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.codeClient.trim()) params['code_client'] = this.codeClient.trim();
    if (this.statutFilter) params['statut'] = this.statutFilter;
    if (this.idEvenement.trim()) params['id_evenement'] = this.idEvenement.trim();
    return params;
  }

  loadDiligences(): void {
    this.loading = true;
    this.errorMessage = null;
    this.labService.getDiligencesLab(this.buildParams()).subscribe({
      next: (res) => {
        let data = res.data || [];
        if (this.retardFilter === 'late') {
          data = data.filter((row) => this.isLate(row));
        }
        this.rows = this.applyClientSearch(data);
        this.total = this.rows.length;
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement diligences LAB:', err);
        this.errorMessage = 'Impossible de charger les diligences du cabinet.';
        this.rows = [];
        this.total = 0;
        this.loading = false;
      },
    });
  }

  private applyClientSearch(data: LabDiligenceListItem[]): LabDiligenceListItem[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((row) => {
      const haystack = [
        row.client,
        row.code_client,
        row.intitule,
        row.type_diligence,
        row.type_evenement,
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
      id_evenement: this.idEvenement.trim() || null,
      retard: this.retardFilter || null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: '',
      replaceUrl: true,
    });
    this.loadDiligences();
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

  openPlanSuivi(row: LabDiligenceListItem): void {
    if (!row.code_client) return;
    this.router.navigate(['/lab/dossier'], {
      queryParams: { code_client: row.code_client },
    });
  }

  eventLinkParams(row: LabDiligenceListItem): Record<string, string> {
    const params: Record<string, string> = {};
    if (row.code_client) params['code_client'] = row.code_client;
    if (row.id_evenement != null && String(row.id_evenement).trim() !== '') {
      params['id_evenement'] = String(row.id_evenement);
    }
    return params;
  }

  isLate(row: LabDiligenceListItem): boolean {
    if (row.statut === 'Realisee' || row.statut === 'Abandonnee') return false;
    if (!row.date_echeance) return false;
    const echeance = new Date(row.date_echeance);
    if (Number.isNaN(echeance.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    echeance.setHours(0, 0, 0, 0);
    return echeance < today;
  }

  displayValue(value: string | null | undefined): string {
    const v = value != null ? String(value).trim() : '';
    return v || '—';
  }

  statutLabel(value: string | null | undefined): string {
    if (value === 'A_faire') return 'À faire';
    if (value === 'En_cours') return 'En cours';
    if (value === 'Realisee') return 'Réalisée';
    if (value === 'Abandonnee') return 'Abandonnée';
    return this.displayValue(value);
  }

  statutClass(row: LabDiligenceListItem): string {
    if (row.statut === 'A_faire') return 'pill pill--amber';
    if (row.statut === 'En_cours') return 'pill pill--blue';
    if (row.statut === 'Realisee') return 'pill pill--green';
    if (row.statut === 'Abandonnee') return 'pill';
    return 'pill';
  }

  typeLabel(value: string | null | undefined): string {
    const v = value != null ? String(value).trim() : '';
    if (!v) return '—';
    return v.replace(/_/g, ' ');
  }
}
