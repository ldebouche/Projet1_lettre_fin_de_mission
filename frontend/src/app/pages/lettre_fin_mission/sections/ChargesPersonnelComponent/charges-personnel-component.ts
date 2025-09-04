import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-charges-personnel-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './charges-personnel-component.html',
  styleUrl: './charges-personnel-component.scss'
})
export class ChargesPersonnelComponent {
  @Input({ required: true }) group!: FormGroup;
}
