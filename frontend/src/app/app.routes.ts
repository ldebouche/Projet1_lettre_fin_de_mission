import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { AccueilIntranet } from './pages/accueil-intranet/accueil-intranet';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginDossierComponent } from './pages/login-dossier/login-dossier';
import { LettreFinMissionComponent } from './pages/lettre_fin_mission/lettre_fin_mission';
import { AccueilMissionComponent } from './pages/accueil-mission/accueil-mission';
import { ChatbotSettingsComponent } from './pages/chatbot-settings/chatbot-settings';
import { AnaSectorielleSettingsComponent } from './pages/ana-secto-settings/ana-secto-settings';
import { PilotageEquipeComponent } from './pages/pilotage-equipe/pilotage-equipe';
import { MonActiviteComponent } from './pages/mon-activite/mon-activite';
import { LabDossierComponent } from './pages/lab/lab-dossier/lab-dossier';
import { LabDashboardComponent } from './pages/lab/lab-dashboard/lab-dashboard';
import { LabPortefeuilleComponent } from './pages/lab/lab-portefeuille/lab-portefeuille';
import { LabDossierFormWizardComponent } from './pages/lab/lab-dossier-form-wizard/lab-dossier-form-wizard';
import { LabEvenementsComponent } from './pages/lab/lab-evenements/lab-evenements';
import { LabDiligencesComponent } from './pages/lab/lab-diligences/lab-diligences';

export const routes: Routes = [
  { path: '', component: AccueilIntranet, canActivate: [MsalGuard] },
  { path: 'refresh', component: AccueilIntranet },
  { path: 'dashboard', component: DashboardComponent, canActivate: [MsalGuard] },
  { path: 'mon-activite', component: MonActiviteComponent, canActivate: [MsalGuard] },
  { path: 'login-dossier', component: LoginDossierComponent, canActivate: [MsalGuard] },
  { path: 'lettre-fin-mission', component: LettreFinMissionComponent, canActivate: [MsalGuard] },
  { path: 'accueil-mission', component: AccueilMissionComponent, canActivate: [MsalGuard] },
  { path: 'chatbot-settings', component: ChatbotSettingsComponent, canActivate: [MsalGuard] },
  { path: 'ana-secto-settings', component: AnaSectorielleSettingsComponent, canActivate: [MsalGuard] },
  // Ancien mock LAB : redirige vers le portefeuille réel (MsalGuard sur /lab/*).
  { path: 'login-lab', redirectTo: 'lab/portefeuille', pathMatch: 'full' },
  { path: 'lab-dashboard-dossier', redirectTo: 'lab/portefeuille', pathMatch: 'full' },
  { path: 'pilotage-equipe', component: PilotageEquipeComponent, canActivate: [MsalGuard] },
  { path: 'lab/dashboard', component: LabDashboardComponent, canActivate: [MsalGuard] },
  { path: 'lab/portefeuille', component: LabPortefeuilleComponent, canActivate: [MsalGuard] },
  { path: 'lab/evenements', component: LabEvenementsComponent, canActivate: [MsalGuard] },
  { path: 'lab/diligences', component: LabDiligencesComponent, canActivate: [MsalGuard] },
  {
    path: 'lab/dossier/formulaire',
    component: LabDossierFormWizardComponent,
    canActivate: [MsalGuard],
  },
  // Ancienne page autonome ARPEC : redirige vers le Plan & suivi (ARPEC = wizard / revue).
  { path: 'lab/dossier/risque', redirectTo: 'lab/dossier', pathMatch: 'full' },
  { path: 'lab/dossier', component: LabDossierComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '/' }
];
