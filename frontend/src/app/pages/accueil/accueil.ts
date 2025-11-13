import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';

import { CartesPrincipalesComponent } from './cartes_principales/cartes-principales';

@Component({
  selector: 'app-accueil',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CartesPrincipalesComponent
  ],
  templateUrl: './accueil.html',
  styleUrl: './accueil.scss'
})
export class AccueilComponent {
  sections = ["a", "b", "c"];
}
