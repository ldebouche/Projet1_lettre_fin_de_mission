import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-signataire-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './signataire-component.html',
  styleUrl: './signataire-component.scss'
})
export class SignataireComponent {
  @Input({ required: true }) group!: FormGroup;
}
