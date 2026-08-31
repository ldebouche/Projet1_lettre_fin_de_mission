import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import type { WizardBeRow } from '../../../services/lab-service';
import { emptyBe, genWizardId, isPersistedId } from '../lab-dossier-form-wizard/lab-wizard-hydrate';

@Component({
  selector: 'app-lab-wizard-be',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent],
  templateUrl: './lab-wizard-be.html',
  styleUrls: [
    '../lab-dossier-form-wizard/lab-dossier-form-wizard.scss',
    './lab-wizard-be.scss',
  ],
})
export class LabWizardBeComponent {
  @Input() beneficiaires: WizardBeRow[] = [];
  @Output() beneficiairesChange = new EventEmitter<WizardBeRow[]>();
  @Output() removedPersistedId = new EventEmitter<string>();

  addBeneficiaire(): void {
    const rows = [...this.beneficiaires, emptyBe(genWizardId('be'))];
    this.beneficiaires = rows;
    this.beneficiairesChange.emit(rows);
  }

  removeBeneficiaire(id: string): void {
    if (isPersistedId(id)) {
      this.removedPersistedId.emit(id);
    }
    const next = this.beneficiaires.filter((b) => b.id !== id);
    const rows = next.length ? next : [emptyBe(genWizardId('be'))];
    this.beneficiaires = rows;
    this.beneficiairesChange.emit(rows);
  }

  trackById(_index: number, row: { id: string }): string {
    return row.id;
  }
}
