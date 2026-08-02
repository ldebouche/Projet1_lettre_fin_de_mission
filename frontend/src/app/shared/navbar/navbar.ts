import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MsalService } from '@azure/msal-angular';

import { DataService } from '../../services/data-service';
import { RolesService } from '../../services/roles-service';
import {
  ActiviteKey,
  ActiviteOption,
  getActiviteOptions,
  isActiviteKey,
} from '../../pages/mon-activite/mon-activite-config';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    RouterModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss']
})
export class NavbarComponent implements OnInit {
  currentUrl: string = '';
  collaborateur: any;
  hasRole: boolean = false;
  hasRoleLab: boolean = false;

  adminMenuOpen = false;

  activiteOptions: ActiviteOption[] = [];
  selectedActivite: ActiviteKey | '' = '';

  constructor(
    private router: Router,
    private location: Location,
    private msalService: MsalService,
    private dataService: DataService,
    private rolesService: RolesService
  ) {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.currentUrl = this.router.url;
      this.adminMenuOpen = false;
      this.syncSelectedActiviteFromUrl();
    });
  }

  ngOnInit() {
    this.currentUrl = this.router.url;
    this.syncSelectedActiviteFromUrl();

    this.dataService.collaborateur$.subscribe((collab) => {
      this.collaborateur = collab;

      this.hasRole = this.rolesService.hasRoles(this.collaborateur?.groupes_microsoft || [], ["admin", "informatique"]);
      this.hasRoleLab = this.rolesService.hasRoles(this.collaborateur?.groupes_microsoft || [], ["admin", "informatique", "lab"]);
      this.activiteOptions = getActiviteOptions(this.collaborateur?.groupes_microsoft || []);
    });
  }

  /** Visible uniquement si le collaborateur a au moins un rapport autorisé. */
  get showMonActivite(): boolean {
    return this.activiteOptions.length > 0;
  }

  onActiviteChange(): void {
    if (!this.selectedActivite) return;

    this.router.navigate(['/mon-activite'], {
      queryParams: { rapport: this.selectedActivite }
    });
  }

  private syncSelectedActiviteFromUrl(): void {
    if (!this.currentUrl.startsWith('/mon-activite')) {
      this.selectedActivite = '';
      return;
    }
    const qIndex = this.currentUrl.indexOf('?');
    if (qIndex === -1) {
      this.selectedActivite = '';
      return;
    }
    const rapport = new URLSearchParams(this.currentUrl.slice(qIndex + 1)).get('rapport');
    this.selectedActivite = isActiviteKey(rapport) ? rapport : '';
  }

  toggleAdminMenu() {
    this.adminMenuOpen = !this.adminMenuOpen;
  }

  closeAdminMenu() {
    this.adminMenuOpen = false;
  }

  handleReturn() {
    const returnTo = this.resolveReturnToFromUrl();
    if (returnTo && this.currentUrl.startsWith('/lab/dossier')) {
      this.router.navigate([returnTo]);
      return;
    }

    // Les URLs avec query params (ex: /lab/dossier?code_client=...) ne matchent pas
    // une clé de mapping "exacte" : on gère ce cas via un préfixe.
    if (this.currentUrl.startsWith('/lab/dossier/formulaire')) {
      this.router.navigate(['/lab/portefeuille']);
      return;
    }

    if (this.currentUrl.startsWith('/lab/dossier')) {
      this.router.navigate(['/lab/portefeuille']);
      return;
    }

    // Pages LAB avec query string éventuelle (ex: /lab/portefeuille?niveau=...)
    if (this.currentUrl.startsWith('/lab/portefeuille')) {
      this.router.navigate(['/lab/dashboard']);
      return;
    }

    if (this.currentUrl.startsWith('/lab/dashboard')) {
      this.router.navigate(['/accueil-intranet']);
      return;
    }

    if (this.currentUrl.startsWith('/mon-activite')) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const routesMap: Record<string, string> = {
      "/ana-secto-settings": "/",
      "/chatbot-settings": "/",
      "/dashboard": "/",
      "/login-dossier": "/dashboard",
      "/accueil-mission": "/login-dossier",
      "/lettre-fin-mission": "/accueil-mission",
    };

    const target = routesMap[this.currentUrl];
    if (target) this.router.navigate([target]);
  }

  /** Cible de retour explicite (?returnTo=…) — ex. depuis accueil-mission. */
  private resolveReturnToFromUrl(): string | null {
    const qIndex = this.currentUrl.indexOf('?');
    if (qIndex === -1) return null;

    const raw = new URLSearchParams(this.currentUrl.slice(qIndex + 1)).get('returnTo')?.trim();
    if (!raw) return null;

    try {
      const path = decodeURIComponent(raw);
      if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
        return null;
      }
      const allowed = new Set([
        '/accueil-mission',
        '/login-dossier',
        '/lab/dashboard',
        '/lab/portefeuille',
        '/accueil-intranet',
        '/dashboard',
      ]);
      return allowed.has(path) ? path : null;
    } catch {
      return null;
    }
  }

  logout() {
    this.dataService.clearData();
    this.dataService.clearCollaborateur();

    this.msalService.instance.logoutRedirect({
      account: this.msalService.instance.getActiveAccount(),
      postLogoutRedirectUri: window.location.origin + "/"
    });
  }
}
