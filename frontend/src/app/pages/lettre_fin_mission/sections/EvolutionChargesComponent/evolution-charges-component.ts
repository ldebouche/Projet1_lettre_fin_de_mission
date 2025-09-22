import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-evolution-charges-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
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
