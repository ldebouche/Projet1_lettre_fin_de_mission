import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabWizardFieldMetaComponent } from '../lab-wizard-field-meta/lab-wizard-field-meta';
import { LabBodaccChecklistComponent } from '../lab-bodacc-checklist/lab-bodacc-checklist';
import type {
  LabBodaccAlerte,
  LabFieldMeta,
  LabWizardFormModel,
} from '../../../services/lab-service';

@Component({
  selector: 'app-lab-wizard-identite',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LabCarteComponent,
    LabWizardFieldMetaComponent,
    LabBodaccChecklistComponent,
  ],
  templateUrl: './lab-wizard-identite.html',
  styleUrls: [
    '../lab-dossier-form-wizard/lab-dossier-form-wizard.scss',
    './lab-wizard-identite.scss',
  ],
})
export class LabWizardIdentiteComponent {
  @Input({ required: true }) m!: LabWizardFormModel;
  @Input() fieldMeta: Record<string, LabFieldMeta> = {};
  @Input() enriching = false;
  @Input() enrichmentError: string | null = null;
  @Input() alertesBodacc: LabBodaccAlerte[] = [];
  @Input() bodaccPendingCritical = 0;
  @Input() bodaccSectionOpen = false;
  @Input() codeClient: string | null = null;
  @Input() clientExpertComptableDisplay = '—';
  @Input() clientChefDeMissionDisplay = '—';

  @Output() enrich = new EventEmitter<void>();
  @Output() acceptApi = new EventEmitter<string>();
  @Output() siretBlur = new EventEmitter<void>();
  @Output() bodaccProgressChange = new EventEmitter<number>();
  @Output() bodaccSectionToggle = new EventEmitter<boolean>();
  @Output() navigateStep = new EventEmitter<string>();

  @ViewChild('bodaccChecklist') bodaccChecklist?: LabBodaccChecklistComponent;

  get isPm(): boolean {
    return this.m.kyc.categorie_client !== 'Personne_physique';
  }

  getFieldMeta(key: string): LabFieldMeta | null {
    return this.fieldMeta[key] ?? null;
  }
}
