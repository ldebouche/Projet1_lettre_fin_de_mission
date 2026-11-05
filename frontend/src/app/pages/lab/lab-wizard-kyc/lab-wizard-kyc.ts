import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabWizardFieldMetaComponent } from '../lab-wizard-field-meta/lab-wizard-field-meta';
import type { LabFieldMeta, LabWizardFormModel } from '../../../services/lab-service';
import {
  LAB_PAYS_ISO,
  LAB_PAYS_RISQUE,
  ensurePaysInOptions,
  formatPaysRisqueText,
  parsePaysRisqueText,
  type LabPaysOption,
} from '../lab-pays-data';

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

  /** Lu depuis le texte KYC (hydrate / BDD) pour rester synchro sans changer la ref de `m`. */
  get paysRisqueSelected(): string[] {
    return parsePaysRisqueText(this.m?.kyc?.pays_a_risque_text);
  }

  get paysIsoOptions(): LabPaysOption[] {
    return ensurePaysInOptions(
      ensurePaysInOptions(LAB_PAYS_ISO, this.m?.kyc?.pays_residence_fiscale),
      this.m?.kyc?.pays_implantation,
    );
  }

  get paysRisqueOptions(): LabPaysOption[] {
    let opts = LAB_PAYS_RISQUE;
    for (const p of this.paysRisqueSelected) {
      opts = ensurePaysInOptions(opts, p);
    }
    return opts;
  }

  getFieldMeta(key: string): LabFieldMeta | null {
    return this.fieldMeta[key] ?? null;
  }

  onOrigineFondsStatutChange(statut: string): void {
    this.m.kyc.origine_fonds_requise =
      statut === 'A_renseigner' || statut === 'Renseignee';
  }

  onPaysRisqueChange(selected: string[]): void {
    this.m.kyc.pays_a_risque_text = formatPaysRisqueText(selected || []);
  }
}
