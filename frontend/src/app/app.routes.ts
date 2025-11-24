import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { PortalLoginComponent } from './pages/portal-login/portal-login';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginComponent } from './pages/login/login';
import { FormulaireComponent } from './pages/lettre_fin_mission/formulaire';
import { AccueilComponent } from './pages/accueil/accueil';

export const routes: Routes = [
  { path: '', component: PortalLoginComponent, canActivate: [MsalGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [MsalGuard] },
  { path: 'login', component: LoginComponent, canActivate: [MsalGuard] },
  { path: 'formulaire', component: FormulaireComponent, canActivate: [MsalGuard] },
  { path: 'accueil', component: AccueilComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '/' }
];
