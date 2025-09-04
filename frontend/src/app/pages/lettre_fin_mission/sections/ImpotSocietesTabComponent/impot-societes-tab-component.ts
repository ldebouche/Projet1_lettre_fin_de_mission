import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-impot-societes-tab-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './impot-societes-tab-component.html',
  styleUrl: './impot-societes-tab-component.scss'
})
export class ImpotSocietesTabComponent {
  @Input({ required: true }) group!: FormGroup;
}
