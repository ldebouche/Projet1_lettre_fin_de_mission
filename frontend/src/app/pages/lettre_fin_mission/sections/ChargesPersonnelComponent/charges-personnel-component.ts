import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-charges-personnel-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty,
    BtnToTextareaComponent
  ],
  templateUrl: './charges-personnel-component.html',
  styleUrl: './charges-personnel-component.scss'
})
export class ChargesPersonnelComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() anneeN1Existe: boolean = true;
  @Input() infoChargesPersonnel: any

  isChecked: boolean = false;
  selectedFile: File | null = null;
  fileUrl: string | null = null;

  indicateurs: any[] = [];

  ngOnInit() {
    this.group.get('heuresRemunN')?.valueChanges.subscribe(() => this.updateComputedValues());
    this.group.get('heuresRemunN1')?.valueChanges.subscribe(() => this.updateComputedValues());

    this.updateComputedValues();
  }

  updateComputedValues(): void {
    const heuresN = Number(this.group.get('heuresRemunN')?.value) || 0;
    const heuresN1 = Number(this.group.get('heuresRemunN1')?.value) || 0;
    const CP_N = Number(this.infoChargesPersonnel?.CP_N) || 0;
    const CP_N1 = Number(this.infoChargesPersonnel?.CP_N1) || 0;

    this.infoChargesPersonnel.CP_heureVar = heuresN - heuresN1;

    if (heuresN1 !== 0) {
      this.infoChargesPersonnel["CP_%heureVar"] =
        this.infoChargesPersonnel.CP_heureVar < 0
          ? (-1 + (heuresN / heuresN1)) * 100
          : (1 - (heuresN1 / heuresN)) * 100;
    } else {
      this.infoChargesPersonnel["CP_%heureVar"] = 0;
    }

    this.infoChargesPersonnel.CP_coutHorN = heuresN !== 0 ? CP_N / heuresN : 0;
    this.infoChargesPersonnel.CP_coutHorN1 = heuresN1 !== 0 ? CP_N1 / heuresN1 : 0;
  }

  getValue(key?: string, isPercent: boolean = false, isVariation: boolean = false): string {
    if (!key) return '';
    const val = this.infoChargesPersonnel[key];
    if (val == null || val === '') return '';

    if (isPercent && isVariation && (val < -100 || val > 100)) return 'NS'; 

    return isPercent 
      ? Number(val).toFixed(2)
      : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }

  checked() { 
    if (this.isChecked) {
      this.isChecked = false;
    } else {
      this.isChecked = true;
    }
  }
  
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (file.type !== 'application/pdf') {
        alert('Veuillez sélectionner un fichier PDF.');
        return;
      }

      this.selectedFile = file;
      this.fileUrl = URL.createObjectURL(file);
    }
  }

  openSelectedFile() {
    if (this.fileUrl) {
      window.open(this.fileUrl, '_blank');
    }
  }
  removeSelectedFile() {
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
    }
    this.selectedFile = null;
    this.fileUrl = null;
  }
}
