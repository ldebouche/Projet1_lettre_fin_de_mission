import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { AccueilIntranet } from './pages/accueil-intranet/accueil-intranet';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginDossierComponent } from './pages/login-dossier/login-dossier';
import { LettreFinMissionComponent } from './pages/lettre_fin_mission/lettre_fin_mission';
import { AccueilMissionComponent } from './pages/accueil-mission/accueil-mission';
import { ChatbotSettingsComponent } from './pages/chatbot-settings/chatbot-settings';

export const routes: Routes = [
  { path: '', component: AccueilIntranet, canActivate: [MsalGuard] },
  { path: 'refresh', component: AccueilIntranet },
  { path: 'dashboard', component: DashboardComponent, canActivate: [MsalGuard] },
  { path: 'login-dossier', component: LoginDossierComponent, canActivate: [MsalGuard] },
  { path: 'lettre-fin-mission', component: LettreFinMissionComponent, canActivate: [MsalGuard] },
  { path: 'accueil-mission', component: AccueilMissionComponent, canActivate: [MsalGuard] },
  { path: 'chatbot-settings', component: ChatbotSettingsComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '/' }
];
