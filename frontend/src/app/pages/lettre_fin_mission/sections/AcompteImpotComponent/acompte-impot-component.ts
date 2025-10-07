import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';

@Component({
  selector: 'section-acompte-impot-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty
  ],
  templateUrl: './acompte-impot-component.html',
  styleUrl: './acompte-impot-component.scss'
})
export class AcompteImpotComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() moisCloture: Array<string> = [];
}
