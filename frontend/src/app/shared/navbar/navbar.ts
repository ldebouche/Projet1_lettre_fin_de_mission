import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MsalService } from '@azure/msal-angular';

import { DataService } from '../../services/data-service';
import { RolesService, GROUPES_CARTOGRAPHIE } from '../../services/roles-service';
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
  hasRoleAdmin: boolean = false;
  hasRoleLab: boolean = false;

  adminMenuOpen = false;

  activiteOptions: ActiviteOption[] = [];
  selectedActivite: ActiviteKey | '' = '';

  /** Historique interne des URLs pour un Retour fiable (évite location.back hors app). */
  private urlHistory: string[] = [];
  private skipNextHistoryPush = false;

  constructor(
    private router: Router,
    private location: Location,
    private msalService: MsalService,
    private dataService: DataService,
    private rolesService: RolesService
  ) {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      const url = e.urlAfterRedirects || e.url;
      this.pushHistory(url);
      this.currentUrl = url;
      this.adminMenuOpen = false;
      this.syncSelectedActiviteFromUrl();
    });
  }

  ngOnInit() {
    this.currentUrl = this.router.url;
    this.pushHistory(this.currentUrl);
    this.syncSelectedActiviteFromUrl();

    this.dataService.collaborateur$.subscribe((collab) => {
      this.collaborateur = collab;

      this.hasRoleAdmin = this.rolesService.hasRoles(this.collaborateur?.groupes_microsoft || [], ["admin", "informatique"]);
      this.hasRoleLab = this.rolesService.hasRoles(this.collaborateur?.groupes_microsoft || [], GROUPES_CARTOGRAPHIE);
      this.hasRole = this.hasRoleAdmin || this.hasRoleLab;
      this.activiteOptions = getActiviteOptions(this.collaborateur?.groupes_microsoft || []);
    });
  }

  private pushHistory(url: string): void {
    if (this.skipNextHistoryPush) {
      this.skipNextHistoryPush = false;
      return;
    }
    const last = this.urlHistory[this.urlHistory.length - 1];
    if (last === url) return;
    this.urlHistory.push(url);
    if (this.urlHistory.length > 40) {
      this.urlHistory.shift();
    }
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
    // 1) Historique de navigation dans l’app → toujours la page précédente réelle
    if (this.urlHistory.length >= 2) {
      this.urlHistory.pop();
      const target = this.urlHistory[this.urlHistory.length - 1];
      this.skipNextHistoryPush = true;
      void this.router.navigateByUrl(target);
      return;
    }

    // 2) Entrée directe avec ?returnTo=…
    const returnTo = this.resolveReturnToFromUrl();
    if (returnTo) {
      void this.router.navigateByUrl(returnTo);
      return;
    }

    // 3) Secours navigateur, puis accueil
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    void this.router.navigate(['/accueil-intranet']);
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
