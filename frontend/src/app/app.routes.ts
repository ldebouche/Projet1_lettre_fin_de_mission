import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginComponent } from './pages/login/login';
import { FormulaireComponent } from './pages/lettre_fin_mission/formulaire';
import { AccueilComponent } from './pages/accueil/accueil';
import { ChatbotSettingsComponent } from './pages/chatbot-settings/chatbot-settings';

export const routes: Routes = [
  { path: '', component: DashboardComponent, canActivate: [MsalGuard] },
  { path: 'refresh', component: DashboardComponent },
  { path: 'login', component: LoginComponent, canActivate: [MsalGuard] },
  { path: 'formulaire', component: FormulaireComponent, canActivate: [MsalGuard] },
  { path: 'accueil', component: AccueilComponent, canActivate: [MsalGuard] },
  { path: 'chatbot-settings', component: ChatbotSettingsComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '/' }
];
