import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-evolution-charges-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './evolution-charges-component.html',
  styleUrl: './evolution-charges-component.scss'
})
export class EvolutionChargesComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() infoEvolutionCharges: any;
  @Input() anneeN1Existe: boolean = true;

  getValue(val: any, isPercent: boolean = false): string {
    if (val == null || val === '') return '';
    return isPercent 
      ? Number(val).toFixed(2)
      : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }

  get variation(): FormGroup {
    return this.group.get('variation') as FormGroup;
  }
}
