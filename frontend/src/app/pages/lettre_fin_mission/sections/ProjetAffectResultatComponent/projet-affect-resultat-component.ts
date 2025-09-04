import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-projet-affect-resultat-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './projet-affect-resultat-component.html',
  styleUrl: './projet-affect-resultat-component.scss'
})
export class ProjetAffectResultatComponent {
  @Input({ required: true }) group!: FormGroup;
}
