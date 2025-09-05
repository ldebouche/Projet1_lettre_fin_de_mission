import { Component } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { NavbarComponent } from './shared/navbar/navbar';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, 
    NavbarComponent,
    CommonModule
  ],
  template: `
    <app-navbar *ngIf="showNavbar"></app-navbar>
    <main class="p-6">
      <router-outlet></router-outlet>
    </main>
  `
})
export class AppComponent {
  constructor(private router: Router) {}

  get showNavbar() {
    // cache la navbar uniquement si on est sur /login
    return this.router.url !== '/login';
  }
}