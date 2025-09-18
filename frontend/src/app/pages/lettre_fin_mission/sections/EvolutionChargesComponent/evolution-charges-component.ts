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
  @Input() anneeN1Existe: boolean = true;

  get variation(): FormGroup {
    return this.group.get('variation') as FormGroup;
  }
}
