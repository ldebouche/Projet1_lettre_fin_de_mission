import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TimeoutError } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabShellComponent } from '../lab-shell/lab-shell';
import { LabDossierListItem, LabDossiersQuery, LabEvenement, LabService } from '../../../services/lab-service';

type RevueFilter = '' | 'late' | 'soon';
type KycFilter = '' | 'Complet' | 'Incomplet';
type NiveauFilter = '' | 'Faible' | 'Moyen' | 'Élevé' | 'Non évalué';
type VigilanceFilter = '' | 'Standard' | 'Renforcee';

type PortefeuilleRow = LabDossierListItem & {
  retardRevueJours: number;
  revueProcheJours: number | null;
  kycComplet: boolean;
};

@Component({
  selector: 'app-lab-portefeuille',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabCarteComponent, LabShellComponent],
  templateUrl: './lab-portefeuille.html',
  styleUrls: ['./lab-portefeuille.scss'],
})
export class LabPortefeuilleComponent implements OnInit {
  loading = false;
  exporting = false;
  errorMessage: string | null = null;

  search = '';
  niveauFilter: NiveauFilter = '';
  vigilanceFilter: VigilanceFilter = '';
  revueFilter: RevueFilter = '';
  kycFilter: KycFilter = '';

  secteurFilter: string | null = null;
  paysFilter: string | null = null;

  // Page courante renvoyée par le serveur (filtres + pagination côté serveur).
  rows: PortefeuilleRow[] = [];
  page = 1;
  pageSize = 50;
  total = 0;

  // Synthèse du portefeuille COMPLET (périmètre de l'utilisateur), via le dashboard.
  // Indépendante des filtres / de la pagination de la table.
  summary = {
    total: 0,
    risqueEleve: 0,
    revuesEnRetard: 0,
    diligencesEnRetard: 0,
    vigilanceRenforcee: 0,
  };

  constructor(
    private labService: LabService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.readQueryParams();
    this.loadSummary();
    this.loadDossiers();
  }

  private readQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;

    const niveau = this.normalizeRisk(params.get('niveau'));
    if (niveau === 'faible') this.niveauFilter = 'Faible';
    else if (niveau === 'moyen') this.niveauFilter = 'Moyen';
    else if (niveau === 'eleve') this.niveauFilter = 'Élevé';
    else if (niveau === 'non evalue') this.niveauFilter = 'Non évalué';

    const vigilance = this.normalizeSearch(params.get('vigilance'));
    if (vigilance === 'standard') this.vigilanceFilter = 'Standard';
    else if (vigilance === 'renforcee') this.vigilanceFilter = 'Renforcee';

    const secteur = params.get('secteur');
    this.secteurFilter = secteur && secteur.trim() ? secteur.trim() : null;

    const pays = params.get('pays');
    this.paysFilter = pays && pays.trim() ? pays.trim() : null;
  }

  private buildQuery(): LabDossiersQuery {
    const query: LabDossiersQuery = { page: this.page, pageSize: this.pageSize };

    const term = this.search.trim();
    if (term) query.search = term;

    const niveau = this.mapNiveauForServer(this.niveauFilter);
    if (niveau) query.niveau = niveau;

    if (this.vigilanceFilter) query.vigilance = this.vigilanceFilter;
    if (this.revueFilter) query.revue = this.revueFilter;
    if (this.kycFilter) query.kyc = this.kycFilter;

    if (this.secteurFilter) {
      query.secteur = this.isNonRenseigne(this.secteurFilter) ? '__NON_RENSEIGNE__' : this.secteurFilter;
    }
    if (this.paysFilter) {
      query.pays = this.isNonRenseigne(this.paysFilter) ? '__NON_RENSEIGNE__' : this.paysFilter;
    }

    return query;
  }

  private mapNiveauForServer(niveau: NiveauFilter): LabDossiersQuery['niveau'] | undefined {
    if (niveau === 'Faible') return 'Faible';
    if (niveau === 'Moyen') return 'Moyen';
    if (niveau === 'Élevé') return 'Eleve';
    if (niveau === 'Non évalué') return 'NonEvalue';
    return undefined;
  }

  private loadDossiers(): void {
    this.loading = true;
    this.errorMessage = null;
    this.labService.getDossiersLab(this.buildQuery()).subscribe({
      next: (res) => {
        this.rows = (res.data || []).map((dossier) => this.toRow(dossier));
        this.total = res.total ?? this.rows.length;
        this.page = res.page ?? this.page;
        this.pageSize = res.pageSize ?? this.pageSize;
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement portefeuille LAB:', err);
        this.errorMessage = 'Impossible de charger le portefeuille clients.';
        this.loading = false;
      },
    });
  }

  private loadSummary(): void {
    this.labService.getDashboardLab().subscribe({
      next: (res) => {
        const data = res.data;
        const eleve = (data.histogramRisque || []).find(
          (bar) => this.normalizeSearch(bar.label) === 'eleve'
        );
        this.summary = {
          total: data.kpi.totalClients,
          risqueEleve: eleve?.value ?? 0,
          revuesEnRetard: data.kpi.revuesEnRetard,
          diligencesEnRetard: data.kpi.diligencesEnRetard,
          vigilanceRenforcee: data.kpi.vigilanceRenforcee,
        };
      },
      error: (err) => {
        console.error('Erreur chargement synthèse portefeuille LAB:', err);
      },
    });
  }

  applyFilters(): void {
    this.page = 1;
    this.loadDossiers();
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.search.trim() ||
      this.niveauFilter ||
      this.vigilanceFilter ||
      this.revueFilter ||
      this.kycFilter ||
      this.secteurFilter ||
      this.paysFilter
    );
  }

  resetFilters(): void {
    this.search = '';
    this.niveauFilter = '';
    this.vigilanceFilter = '';
    this.revueFilter = '';
    this.kycFilter = '';
    this.secteurFilter = null;
    this.paysFilter = null;
    this.applyFilters();
  }

  /** Query filtres sans pagination — pour export PDF/CSV du résultat filtré (ou entier). */
  private buildExportQuery(): LabDossiersQuery {
    const query = this.buildQuery();
    delete query.page;
    delete query.pageSize;
    return query;
  }

  exportPortefeuille(format: 'pdf' | 'csv'): void {
    if (this.exporting) return;
    this.exporting = true;
    this.errorMessage = null;
    this.labService
      .exportPortefeuilleLab(this.buildExportQuery(), format)
      .pipe(timeout(300000))
      .subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0) {
          this.errorMessage = 'Export vide reçu du serveur.';
          this.exporting = false;
          return;
        }
        // Si le backend renvoie une erreur JSON en blob, éviter de télécharger un faux PDF.
        if (blob.type && blob.type.includes('application/json')) {
          this.errorMessage =
            format === 'pdf'
              ? 'Impossible de générer le PDF du portefeuille.'
              : 'Impossible de générer le CSV du portefeuille.';
          this.exporting = false;
          return;
        }
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this.downloadBlob(blob, `lab-portefeuille-${stamp}.${format}`);
        this.exporting = false;
      },
      error: (err) => {
        console.error('Erreur export portefeuille LAB:', err);
        if (err instanceof TimeoutError) {
          this.errorMessage =
            'Export trop long (délai dépassé). Réessaie, ou utilise le CSV pour tout le portefeuille.';
        } else {
          this.errorMessage =
            format === 'pdf'
              ? 'Impossible de générer le PDF du portefeuille (connexion interrompue). Réessaie ou exporte en CSV.'
              : 'Impossible de générer le CSV du portefeuille.';
        }
        this.exporting = false;
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  clearSearch(): void {
    this.search = '';
    this.applyFilters();
  }

  clearSecteurFilter(): void {
    this.secteurFilter = null;
    this.applyFilters();
  }

  clearPaysFilter(): void {
    this.paysFilter = null;
    this.applyFilters();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.page * this.pageSize, this.total);
  }

  goToPage(target: number): void {
    const next = Math.min(Math.max(1, target), this.totalPages);
    if (next === this.page) return;
    this.page = next;
    this.loadDossiers();
  }

  prevPage(): void {
    this.goToPage(this.page - 1);
  }

  nextPage(): void {
    this.goToPage(this.page + 1);
  }

  openDossier(row: PortefeuilleRow): void {
    const codeClient = row.code_client?.trim();
    if (!codeClient) return;
    this.router.navigate(['/lab/dossier'], { queryParams: { code_client: codeClient } });
  }

  openRevisionForm(row: PortefeuilleRow): void {
    const codeClient = row.code_client?.trim();
    if (!codeClient) return;
    this.startOrResumeRevision(codeClient);
  }

  private startOrResumeRevision(codeClient: string): void {
    this.labService.getDossierLab(codeClient).subscribe({
      next: (res) => {
        const revue = res.data?.revue_en_cours;
        if (revue?.wizard_url) {
          void this.router.navigateByUrl(revue.wizard_url);
          return;
        }
        const blocking = this.getEvenementsBloquantsRevue(res.data?.evenements);
        if (blocking.length > 0) {
          this.errorMessage =
            'Clôturez d\'abord les événements ouverts (hors revue annuelle) avant de lancer une revue.';
          return;
        }
        this.labService.createRevueLab({
          code_client: codeClient,
          id_responsable: undefined,
        }).subscribe({
          next: (createRes) => {
            const wizardUrl = createRes.data?.wizard_url;
            if (wizardUrl) {
              void this.router.navigateByUrl(wizardUrl);
            } else if (createRes.data?.revue?.id) {
              void this.router.navigate(['/lab/dossier/formulaire'], {
                queryParams: { code_client: codeClient, id_revue: String(createRes.data.revue.id) },
              });
            }
          },
          error: (err) => {
            console.error('Erreur lancement revue depuis portefeuille:', err);
            const message = (err as { error?: { error?: string } })?.error?.error
              || 'Impossible de lancer la revue.';
            this.errorMessage = message;
          },
        });
      },
      error: (err) => {
        console.error('Erreur chargement dossier pour révision:', err);
        this.errorMessage = 'Impossible de préparer la révision.';
      },
    });
  }

  private getEvenementsBloquantsRevue(evenements: LabEvenement[] | undefined): LabEvenement[] {
    return (evenements ?? []).filter(
      (e) =>
        e.type !== 'REVUE_ANNUELLE' &&
        (e.statut === 'Ouvert' || e.statut === 'En_cours'),
    );
  }

  dossierName(row: PortefeuilleRow): string {
    return row.raison_sociale?.trim() || row.code_client?.trim() || 'Client inconnu';
  }

  displayValue(value: string | null): string {
    return value?.trim() || 'Non renseigné';
  }

  risqueClass(niveau: string | null): string {
    const normalized = this.normalizeRisk(niveau);
    if (normalized === 'faible') return 'pill pill--green';
    if (normalized === 'moyen') return 'pill pill--amber';
    if (normalized === 'eleve') return 'pill pill--red';
    return 'pill pill--gray';
  }

  vigilanceLabel(vigilance: string | null): string {
    const normalized = this.normalizeSearch(vigilance);
    if (normalized === 'renforcee') return 'Renforcée';
    if (normalized === 'standard') return 'Standard';
    return 'Non renseigné';
  }

  vigilanceClass(vigilance: string | null): string {
    const normalized = this.normalizeSearch(vigilance);
    if (normalized === 'renforcee') return 'pill pill--amber';
    if (normalized === 'standard') return 'pill pill--green';
    return 'pill pill--gray';
  }

  diligencesLabel(row: PortefeuilleRow): string {
    if (row.nb_diligences_retard > 0) {
      return `${row.nb_diligences_retard} en retard`;
    }
    return 'À jour';
  }

  private toRow(dossier: LabDossierListItem): PortefeuilleRow {
    const retard = this.daysOverdue(dossier.date_prochaine_revue);
    const proche = this.daysUntil(dossier.date_prochaine_revue);
    return {
      ...dossier,
      retardRevueJours: retard,
      revueProcheJours: proche,
      kycComplet: this.normalizeSearch(dossier.statut_kyc) === 'complet',
    };
  }

  private isNonRenseigne(value: string | null): boolean {
    const normalized = this.normalizeSearch(value);
    return normalized === '' || normalized === 'non renseigne' || normalized === 'non evalue';
  }

  private daysOverdue(value: string | null): number {
    const days = this.daysUntil(value);
    return days !== null && days < 0 ? Math.abs(days) : 0;
  }

  private daysUntil(value: string | null): number | null {
    if (!value) return null;
    const target = new Date(value);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffMs = startOfDay(target) - startOfDay(today);
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  private normalizeRisk(value: string | null): string {
    const normalized = this.normalizeSearch(value);
    if (!normalized || normalized.includes('non evalue') || normalized.includes('non renseigne')) {
      return 'non evalue';
    }
    if (normalized.includes('eleve')) return 'eleve';
    if (normalized.includes('moyen')) return 'moyen';
    if (normalized.includes('faible')) return 'faible';
    return normalized;
  }

  private normalizeSearch(value: string | null): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
