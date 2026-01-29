import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../services/dashboard-service';

@Component({
  selector: 'app-liste-historique',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './liste-historique.html',
  styleUrl: './liste-historique.scss'
})
export class ListeHistoriqueComponent implements OnChanges {
  @Input() codeClient: any = null;

  historiqueData: any = null;
  annees: string[] = [];
  isLoading = false;

  constructor(private dashboardService: DashboardService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['codeClient'] && this.codeClient) {
      this.loadHistory();
    }
  }

  loadHistory() {
    this.isLoading = true;
    console.log(this.codeClient);
    this.dashboardService.getDossiersHistorique(this.codeClient).subscribe({
      next: (data: any) => {
        this.historiqueData = data.clientFiles;
        this.annees = Object.keys(this.historiqueData).sort().reverse();
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      }
    });
  }
}