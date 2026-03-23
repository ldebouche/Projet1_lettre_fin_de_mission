import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { AccueilIntranet } from './pages/accueil-intranet/accueil-intranet';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginDossierComponent } from './pages/login-dossier/login-dossier';
import { LettreFinMissionComponent } from './pages/lettre_fin_mission/lettre_fin_mission';
import { AccueilMissionComponent } from './pages/accueil-mission/accueil-mission';
import { ChatbotSettingsComponent } from './pages/chatbot-settings/chatbot-settings';
import { AnaSectorielleSettingsComponent } from './pages/ana-secto-settings/ana-secto-settings';
import { LoginLabComponent } from './pages/login-lab/login-lab';
import { LabDashboardDossierComponent } from './pages/lab-dashboard-dossier/lab-dashboard-dossier';
import { PilotageEquipeComponent } from './pages/pilotage-equipe/pilotage-equipe';

export const routes: Routes = [
  { path: '', component: AccueilIntranet, canActivate: [MsalGuard] },
  { path: 'refresh', component: AccueilIntranet },
  { path: 'dashboard', component: DashboardComponent, canActivate: [MsalGuard] },
  { path: 'login-dossier', component: LoginDossierComponent, canActivate: [MsalGuard] },
  { path: 'lettre-fin-mission', component: LettreFinMissionComponent, canActivate: [MsalGuard] },
  { path: 'accueil-mission', component: AccueilMissionComponent, canActivate: [MsalGuard] },
  { path: 'chatbot-settings', component: ChatbotSettingsComponent, canActivate: [MsalGuard] },
  { path: 'ana-secto-settings', component: AnaSectorielleSettingsComponent, canActivate: [MsalGuard] },
  { path: 'login-lab', component: LoginLabComponent, canActivate: [MsalGuard] },
  { path: 'lab-dashboard-dossier', component: LabDashboardDossierComponent, canActivate: [MsalGuard] },
  { path: 'pilotage-equipe', component: PilotageEquipeComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '/' }
];
