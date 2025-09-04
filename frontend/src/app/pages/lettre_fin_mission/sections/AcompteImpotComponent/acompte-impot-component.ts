import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-acompte-impot-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './acompte-impot-component.html',
  styleUrl: './acompte-impot-component.scss'
})
export class AcompteImpotComponent {
  @Input({ required: true }) group!: FormGroup;
}
