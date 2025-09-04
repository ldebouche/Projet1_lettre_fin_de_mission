import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-impot-societe-comm-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
  ],
  templateUrl: './impot-societe-comm-component.html',
  styleUrl: './impot-societe-comm-component.scss'
})
export class ImpotSocieteCommComponent {
  @Input({ required: true }) group!: FormGroup;
}
