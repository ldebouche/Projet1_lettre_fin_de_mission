import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabDossierBloc, LabRevue, LabRevueEnCours } from '../../../services/lab-service';
import { statutRevueLabel } from '../lab-labels';

@Component({
  selector: 'app-lab-dossier-revues',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-dossier-revues.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-revues.scss'],
})
export class LabDossierRevuesComponent {
  @Input({ required: true }) lab!: LabDossierBloc;
  @Input() revues: LabRevue[] = [];
  @Input() canLancerRevue = false;
  @Input() lancerRevueDisabledReason: string | null = null;
  @Input() revueEnCours: LabRevueEnCours | null = null;
  @Input() actionBusy = false;

  @Output() lancerRevue = new EventEmitter<void>();

  statutRevueLabel = statutRevueLabel;

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }
}
