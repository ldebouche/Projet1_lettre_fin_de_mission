import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabShellComponent } from '../lab-shell/lab-shell';
import { criticiteLabel, typeEvenementLabel } from '../lab-labels';
import {
  LabDashboardQuery,
  LabDashboardResponse,
  LabService,
} from '../../../services/lab-service';

type NiveauRisque = 'Faible' | 'Moyen' | 'Élevé' | 'Non évalué';
type Criticite = 'Faible' | 'Moyenne' | 'Élevée';
type HistogramKind = 'risque' | 'secteur' | 'pays' | 'vigilance';

type HistogramBar = {
  label: string;
  value: number;
  color?: 'green' | 'orange' | 'red' | 'neutral';
};

type EvenementCritiqueOuvert = {
  client: string;
  type: string;
  criticite: Criticite;
  date: string | null;
};

type RevueEnRetard = {
  client: string;
  echeanceDepassee: string | null;
  retardJours: number;
};

type DiligenceEnRetard = {
  client: string;
  responsable: string;
  echeance: string | null;
  retardJours: number;
};

@Component({
  selector: 'app-lab-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabCarteComponent, LabShellComponent],
  templateUrl: './lab-dashboard.html',
  styleUrls: ['./lab-dashboard.scss'],
})
export class LabDashboardComponent implements OnInit {
  /** Valeur spéciale du select : saisie manuelle d'un id_sellsy (équipe LAB). */
  readonly collabCustom = '__custom__';

  loading = false;
  errorMessage: string | null = null;
  isFull = false;

  /** id_sellsy de l'utilisateur connecté (option « Moi »). */
  meIdSellsy: string | null = null;
  meLabel = 'Moi';

  /** Select : '' | id_sellsy moi | __custom__ */
  collaborateurSelect = '';
  /** Saisie libre id_sellsy si select = custom. */
  collaborateurCustom = '';

  dateDebut = '';
  dateFin = '';

  kpi = {
    totalClients: 0,
    pctRisqueEleve: 0,
    evenementsOuverts: 0,
    diligencesEnRetard: 0,
    revuesEnRetard: 0,
    vigilanceRenforcee: 0,
  };

  histogramRisque: HistogramBar[] = [];

  histogramSecteur: HistogramBar[] = [];

  histogramPays: HistogramBar[] = [];

  histogramVigilance: HistogramBar[] = [];

  evenementsCritiquesOuverts: EvenementCritiqueOuvert[] = [];

  revuesEnRetardListe: RevueEnRetard[] = [];

  diligencesEnRetardListe: DiligenceEnRetard[] = [];

  constructor(
    private labService: LabService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadMeAccess();
    this.loadDashboard();
  }

  get showCustomCollab(): boolean {
    return this.isFull && this.collaborateurSelect === this.collabCustom;
  }

  get hasActiveFilters(): boolean {
    return !!(this.resolvedCollaborateur() || this.dateDebut.trim() || this.dateFin.trim());
  }

  get filterPeriodLabel(): string | null {
    const d = this.dateDebut.trim();
    const f = this.dateFin.trim();
    if (!d && !f) return null;
    if (d && f) return `${this.formatDateFr(d)} → ${this.formatDateFr(f)}`;
    if (d) return `Depuis ${this.formatDateFr(d)}`;
    return `Jusqu'au ${this.formatDateFr(f)}`;
  }

  get filterCollabLabel(): string | null {
    const id = this.resolvedCollaborateur();
    if (!id) return null;
    if (this.meIdSellsy && id === this.meIdSellsy) return this.meLabel;
    return id;
  }

  applyFilters(): void {
    this.loadDashboard();
  }

  resetFilters(): void {
    this.collaborateurSelect = '';
    this.collaborateurCustom = '';
    this.dateDebut = '';
    this.dateFin = '';
    this.loadDashboard();
  }

  clearCollaborateur(): void {
    this.collaborateurSelect = '';
    this.collaborateurCustom = '';
    this.loadDashboard();
  }

  clearPeriod(): void {
    this.dateDebut = '';
    this.dateFin = '';
    this.loadDashboard();
  }

  onCollaborateurSelectChange(): void {
    if (this.collaborateurSelect !== this.collabCustom) {
      this.collaborateurCustom = '';
    }
  }

  private loadMeAccess(): void {
    this.labService.getMeLab().subscribe({
      next: (res) => {
        this.isFull = !!res.data?.canAccessCartographie;
        const id = res.data?.id_sellsy != null ? String(res.data.id_sellsy).trim() : '';
        this.meIdSellsy = id || null;
        this.meLabel = this.buildMeLabel(id);
      },
      error: () => {
        this.isFull = false;
        this.meIdSellsy = null;
        this.hydrateMeFromLocalStorage();
      },
    });
  }

  private hydrateMeFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem('collaborateur');
      if (!raw) return;
      const collab = JSON.parse(raw);
      const id = collab?.id_sellsy != null ? String(collab.id_sellsy).trim() : '';
      if (!id) return;
      this.meIdSellsy = id;
      this.meLabel = this.buildMeLabel(id, collab?.prenom, collab?.nom);
    } catch {
      /* ignore */
    }
  }

  private buildMeLabel(_id: string, prenom?: string, nom?: string): string {
    let p = prenom;
    let n = nom;
    if (!p && !n) {
      try {
        const raw = localStorage.getItem('collaborateur');
        if (raw) {
          const collab = JSON.parse(raw);
          p = collab?.prenom;
          n = collab?.nom;
        }
      } catch {
        /* ignore */
      }
    }
    const name = [p, n].filter(Boolean).join(' ').trim();
    return name ? `Moi — ${name}` : 'Moi';
  }

  private resolvedCollaborateur(): string {
    if (this.collaborateurSelect === this.collabCustom) {
      return this.collaborateurCustom.trim();
    }
    return this.collaborateurSelect.trim();
  }

  private buildQuery(): LabDashboardQuery {
    const q: LabDashboardQuery = {};
    const collab = this.resolvedCollaborateur();
    if (collab) q.collaborateur = collab;
    if (this.dateDebut.trim()) q.date_debut = this.dateDebut.trim();
    if (this.dateFin.trim()) q.date_fin = this.dateFin.trim();
    return q;
  }

  private loadDashboard(): void {
    this.loading = true;
    this.errorMessage = null;
    this.labService.getDashboardLab(this.buildQuery()).subscribe({
      next: (res: { data: LabDashboardResponse }) => {
        const data = res.data;
        this.kpi = data.kpi;
        this.histogramRisque = data.histogramRisque;
        this.histogramSecteur = data.histogramSecteur;
        this.histogramPays = data.histogramPays;
        this.histogramVigilance = data.histogramVigilance ?? [];
        this.evenementsCritiquesOuverts = data.evenementsCritiquesOuverts;
        this.revuesEnRetardListe = data.revuesEnRetardListe;
        this.diligencesEnRetardListe = data.diligencesEnRetardListe;
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement dashboard LAB:', err);
        this.errorMessage = 'Impossible de charger la cartographie cabinet.';
        this.loading = false;
      },
    });
  }

  private formatDateFr(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  getMaxValue(bars: HistogramBar[]) {
    return Math.max(...bars.map((b) => b.value), 1);
  }

  barHeightPercent(b: HistogramBar, bars: HistogramBar[]) {
    const max = this.getMaxValue(bars);
    return Math.round((b.value / max) * 100);
  }

  niveauRisqueClass(niveau: NiveauRisque) {
    if (niveau === 'Faible') return 'risk-pill risk-pill--green';
    if (niveau === 'Moyen') return 'risk-pill risk-pill--orange';
    if (niveau === 'Élevé') return 'risk-pill risk-pill--red';
    return 'risk-pill';
  }

  criticiteClass(criticite: Criticite | string) {
    const v = criticite != null ? String(criticite) : '';
    if (v === 'Faible') return 'risk-pill risk-pill--green';
    if (v === 'Moyenne') return 'risk-pill risk-pill--orange';
    return 'risk-pill risk-pill--red';
  }

  typeEvenementLabel = typeEvenementLabel;
  criticiteLabel = criticiteLabel;

  openPortefeuille(kind: HistogramKind, bar: HistogramBar): void {
    const queryParams =
      kind === 'risque'
        ? { niveau: bar.label }
        : kind === 'secteur'
          ? { secteur: bar.label }
          : kind === 'vigilance'
            ? { vigilance: bar.label }
            : { pays: bar.label };
    this.router.navigate(['/lab/portefeuille'], { queryParams });
  }
}
