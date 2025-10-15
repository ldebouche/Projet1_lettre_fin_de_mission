import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';


@Component({
  selector: 'section-evolution-charges-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty,
    FormsModule
  ],
  templateUrl: './evolution-charges-component.html',
  styleUrl: './evolution-charges-component.scss'
})
export class EvolutionChargesComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() infoEvolutionCharges: any;
  @Input() anneeN1Existe: boolean = true;

  getValue(val: any, isPercent: boolean = false, isVariation: boolean = false): string {
    if (val == null || val === '') return '';

    if (isPercent && isVariation && (val < -100 || val > 100)) return 'NS'; 

    return isPercent 
      ? Number(val).toFixed(2)
      : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }

  get variation(): FormGroup {
    return this.group.get('variation') as FormGroup;
  }

  trackByIndex(index: number, _: any): number {
    return index;
  }
}
