import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabKycBloc } from '../../../services/lab-service';

type LabBadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

@Component({
  selector: 'app-lab-dossier-kyc',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-dossier-kyc.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-kyc.scss'],
})
export class LabDossierKycComponent {
  @Input() kyc: LabKycBloc | null = null;

  getPepTone(value: 'Oui' | 'Non' | 'Inconnu'): LabBadgeTone {
    if (value === 'Oui') return 'danger';
    if (value === 'Inconnu') return 'warn';
    return 'ok';
  }

  getSanctionsTone(value: 'Oui' | 'Non' | 'Inconnu'): LabBadgeTone {
    if (value === 'Oui') return 'danger';
    if (value === 'Inconnu') return 'warn';
    return 'ok';
  }

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }
}
