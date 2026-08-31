import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabWizardFieldMetaComponent } from '../lab-wizard-field-meta/lab-wizard-field-meta';
import type { LabFieldMeta, LabWizardFormModel } from '../../../services/lab-service';

@Component({
  selector: 'app-lab-wizard-kyc',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent, LabWizardFieldMetaComponent],
  templateUrl: './lab-wizard-kyc.html',
  styleUrls: [
    '../lab-dossier-form-wizard/lab-dossier-form-wizard.scss',
    './lab-wizard-kyc.scss',
  ],
})
export class LabWizardKycComponent {
  @Input({ required: true }) m!: LabWizardFormModel;
  @Input() fieldMeta: Record<string, LabFieldMeta> = {};

  @Output() acceptApi = new EventEmitter<string>();

  getFieldMeta(key: string): LabFieldMeta | null {
    return this.fieldMeta[key] ?? null;
  }
}
