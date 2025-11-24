import { Routes } from '@angular/router';
import { PortalLoginComponent } from './pages/portal-login/portal-login';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginComponent } from './pages/login/login';
import { FormulaireComponent } from './pages/lettre_fin_mission/formulaire';
import { AccueilComponent } from './pages/accueil/accueil';

export const routes: Routes = [
  { path: '', component: PortalLoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'login', component: LoginComponent },
  { path: 'formulaire', component: FormulaireComponent},
  { path: 'accueil', component: AccueilComponent},
  { path: '**', redirectTo: '/' }
];
