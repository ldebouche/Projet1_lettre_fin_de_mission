import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { DbService } from '../../../../services/db-service';

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
  @Input() resEx = 0;
}
