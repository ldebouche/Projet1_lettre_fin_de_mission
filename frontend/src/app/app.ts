import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/navbar/navbar';
import { FormulaireComponent } from './pages/lettre_fin_mission/formulaire';
import { BtnToTextareaComponent } from './shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, 
    NavbarComponent,
    FormulaireComponent,
    BtnToTextareaComponent
  ],
  template: `
    <app-navbar></app-navbar>
    <main class="p-6">
      <app-formulaire></app-formulaire>
      <router-outlet></router-outlet>
    </main>
  `
})
export class AppComponent {}
