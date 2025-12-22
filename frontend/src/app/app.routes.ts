import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginDossierComponent } from './pages/login-dossier/login-dossier';
import { LettreFinMissionComponent } from './pages/lettre_fin_mission/lettre_fin_mission';
import { AccueilMissionComponent } from './pages/accueil-mission/accueil-mission';

export const routes: Routes = [
  { path: '', component: DashboardComponent, canActivate: [MsalGuard] },
  { path: 'refresh', component: DashboardComponent },
  { path: 'login-dossier', component: LoginDossierComponent, canActivate: [MsalGuard] },
  { path: 'lettre-fin-mission', component: LettreFinMissionComponent, canActivate: [MsalGuard] },
  { path: 'accueil-mission', component: AccueilMissionComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '/' }
];
