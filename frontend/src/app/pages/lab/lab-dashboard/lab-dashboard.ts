import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabDashboardResponse, LabService } from '../../../services/lab-service';

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
  imports: [CommonModule, RouterLink, LabCarteComponent],
  templateUrl: './lab-dashboard.html',
  styleUrls: ['./lab-dashboard.scss'],
})
export class LabDashboardComponent implements OnInit {
  loading = false;
  errorMessage: string | null = null;

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
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.loading = true;
    this.errorMessage = null;
    this.labService.getDashboardLab().subscribe({
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
        this.errorMessage = 'Impossible de charger le dashboard LAB.';
        this.loading = false;
      }
    });
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

  criticiteClass(criticite: Criticite) {
    if (criticite === 'Faible') return 'risk-pill risk-pill--green';
    if (criticite === 'Moyenne') return 'risk-pill risk-pill--orange';
    return 'risk-pill risk-pill--red';
  }

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
