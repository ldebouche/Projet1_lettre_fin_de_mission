import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import type { LabWizardFormModel, WizardBeRow } from '../../../services/lab-service';
import { emptyBe, genWizardId, isPersistedId } from '../lab-dossier-form-wizard/lab-wizard-hydrate';

type WizardDirigeant = LabWizardFormModel['dirigeant'];

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
  @Input() dirigeant: WizardDirigeant | null = null;
  @Output() beneficiairesChange = new EventEmitter<WizardBeRow[]>();
  @Output() removedPersistedId = new EventEmitter<string>();

  reprendreDirigeant = false;

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

  onReprendreDirigeantChange(checked: boolean): void {
    this.reprendreDirigeant = checked;
    if (!checked || !this.dirigeant) return;

    const base = this.beneficiaires[0] ?? emptyBe(genWizardId('be'));
    const updated: WizardBeRow = {
      ...base,
      type: 'Personne_physique',
      nom: (this.dirigeant.nom || '').trim(),
      prenom: (this.dirigeant.prenom || '').trim(),
      nationalite: (this.dirigeant.nationalite || '').trim(),
    };
    const rows = this.beneficiaires.length
      ? [updated, ...this.beneficiaires.slice(1)]
      : [updated];
    this.beneficiaires = rows;
    this.beneficiairesChange.emit(rows);
  }

  trackById(_index: number, row: { id: string }): string {
    return row.id;
  }
}
