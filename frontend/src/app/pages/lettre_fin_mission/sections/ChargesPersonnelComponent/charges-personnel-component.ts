import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';

@Component({
  selector: 'section-charges-personnel-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty
  ],
  templateUrl: './charges-personnel-component.html',
  styleUrl: './charges-personnel-component.scss'
})
export class ChargesPersonnelComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() anneeN1Existe: boolean = true;
  @Input() infoChargesPersonnel: any

  constructor() {}

  ngOnInit() {
    if (!this.group) return;
    
    this.group.get('heuresRemunN')?.valueChanges.subscribe(() => this.updateComputedValues());
    this.group.get('heuresRemunN1')?.valueChanges.subscribe(() => this.updateComputedValues());

    this.updateComputedValues();
    console.log(this.infoChargesPersonnel);
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
    if (val == null || val === '') return 'NS';
    if (val === 'NS') return 'NS';

    if (isPercent && isVariation && (val < -100 || val > 100)) return 'NS'; 

    return isPercent 
      ? Number(val).toFixed(2)
      : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }
}
