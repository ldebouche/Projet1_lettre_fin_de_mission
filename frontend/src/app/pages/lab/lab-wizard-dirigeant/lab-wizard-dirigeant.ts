import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import type { LabWizardFormModel } from '../../../services/lab-service';

/**
 * Représentant légal / dirigeant — étape 1 wizard.
 * Persisté via wizard_supplement.dirigeant (lab_kyc.origine_patrimoine en BDD).
 * Alimente la Fiche LCB-FT PDF.
 */
@Component({
  selector: 'app-lab-wizard-dirigeant',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent],
  templateUrl: './lab-wizard-dirigeant.html',
  styleUrls: [
    '../lab-dossier-form-wizard/lab-dossier-form-wizard.scss',
    './lab-wizard-dirigeant.scss',
  ],
})
export class LabWizardDirigeantComponent {
  @Input({ required: true }) m!: LabWizardFormModel;
}
