import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import type { LabWizardFormModel } from '../../../services/lab-service';

/**
 * Zone de commentaire libre en bas de l’étape 1 du wizard dossier.
 * Persistée via wizard_supplement.commentaire_etape1.
 * L’extraction IA des infos Fiche (origine contact, honoraires, etc.)
 * se fait à la génération PDF — pas de bouton ici.
 */
@Component({
  selector: 'app-lab-wizard-commentaire',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent],
  templateUrl: './lab-wizard-commentaire.html',
  styleUrls: [
    '../lab-dossier-form-wizard/lab-dossier-form-wizard.scss',
    './lab-wizard-commentaire.scss',
  ],
})
export class LabWizardCommentaireComponent {
  @Input({ required: true }) m!: LabWizardFormModel;
}
