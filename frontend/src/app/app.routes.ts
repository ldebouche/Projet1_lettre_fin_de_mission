import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { FormulaireComponent } from './pages/lettre_fin_mission/formulaire';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'formulaire', component: FormulaireComponent},
  { path: '**', redirectTo: '/login' }
];
