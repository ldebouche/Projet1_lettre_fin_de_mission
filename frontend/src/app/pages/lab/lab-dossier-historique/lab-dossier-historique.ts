import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabRisqueHistoriqueItem } from '../../../services/lab-service';

@Component({
  selector: 'app-lab-dossier-historique',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-dossier-historique.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-historique.scss'],
})
export class LabDossierHistoriqueComponent {
  @Input() risqueHistorique: LabRisqueHistoriqueItem[] = [];

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }
}
