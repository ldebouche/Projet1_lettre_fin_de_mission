import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { AccueilIntranet } from './pages/accueil-intranet/accueil-intranet';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginDossierComponent } from './pages/login-dossier/login-dossier';
import { AccueilMissionComponent } from './pages/accueil-mission/accueil-mission';

export const routes: Routes = [
  { path: '', component: AccueilIntranet, canActivate: [MsalGuard] },
  { path: 'refresh', component: AccueilIntranet },
  { path: 'dashboard', component: DashboardComponent, canActivate: [MsalGuard] },
  {
    path: 'mon-activite',
    loadComponent: () =>
      import('./pages/mon-activite/mon-activite').then((m) => m.MonActiviteComponent),
    canActivate: [MsalGuard],
  },
  { path: 'login-dossier', component: LoginDossierComponent, canActivate: [MsalGuard] },
  {
    path: 'lettre-fin-mission',
    loadComponent: () =>
      import('./pages/lettre_fin_mission/lettre_fin_mission').then(
        (m) => m.LettreFinMissionComponent,
      ),
    canActivate: [MsalGuard],
  },
  { path: 'accueil-mission', component: AccueilMissionComponent, canActivate: [MsalGuard] },
  {
    path: 'chatbot-settings',
    loadComponent: () =>
      import('./pages/chatbot-settings/chatbot-settings').then((m) => m.ChatbotSettingsComponent),
    canActivate: [MsalGuard],
  },
  {
    path: 'ana-secto-settings',
    loadComponent: () =>
      import('./pages/ana-secto-settings/ana-secto-settings').then(
        (m) => m.AnaSectorielleSettingsComponent,
      ),
    canActivate: [MsalGuard],
  },
  // Ancien mock LAB : redirige vers le portefeuille réel (MsalGuard sur /lab/*).
  { path: 'login-lab', redirectTo: 'lab/portefeuille', pathMatch: 'full' },
  { path: 'lab-dashboard-dossier', redirectTo: 'lab/portefeuille', pathMatch: 'full' },
  {
    path: 'pilotage-equipe',
    loadComponent: () =>
      import('./pages/pilotage-equipe/pilotage-equipe').then((m) => m.PilotageEquipeComponent),
    canActivate: [MsalGuard],
  },
  {
    path: 'lab/dashboard',
    loadComponent: () =>
      import('./pages/lab/lab-dashboard/lab-dashboard').then((m) => m.LabDashboardComponent),
    canActivate: [MsalGuard],
  },
  {
    path: 'lab/portefeuille',
    loadComponent: () =>
      import('./pages/lab/lab-portefeuille/lab-portefeuille').then(
        (m) => m.LabPortefeuilleComponent,
      ),
    canActivate: [MsalGuard],
  },
  {
    path: 'lab/evenements',
    loadComponent: () =>
      import('./pages/lab/lab-evenements/lab-evenements').then((m) => m.LabEvenementsComponent),
    canActivate: [MsalGuard],
  },
  {
    path: 'lab/diligences',
    loadComponent: () =>
      import('./pages/lab/lab-diligences/lab-diligences').then((m) => m.LabDiligencesComponent),
    canActivate: [MsalGuard],
  },
  {
    path: 'lab/parametrage',
    loadComponent: () =>
      import('./pages/lab/lab-parametrage/lab-parametrage').then((m) => m.LabParametrageComponent),
    canActivate: [MsalGuard],
  },
  {
    path: 'lab/dossier/formulaire',
    loadComponent: () =>
      import('./pages/lab/lab-dossier-form-wizard/lab-dossier-form-wizard').then(
        (m) => m.LabDossierFormWizardComponent,
      ),
    canActivate: [MsalGuard],
  },
  // Ancienne page autonome ARPEC : redirige vers le Plan & suivi (ARPEC = wizard / revue).
  { path: 'lab/dossier/risque', redirectTo: 'lab/dossier', pathMatch: 'full' },
  {
    path: 'lab/dossier',
    loadComponent: () => import('./pages/lab/lab-dossier/lab-dossier').then((m) => m.LabDossierComponent),
    canActivate: [MsalGuard],
  },
  { path: '**', redirectTo: '/' }
];
