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
      "/lettre-fin-mission": "/accueil-mission"
    };

    const target = routesMap[this.currentUrl];
    if (target) this.router.navigate([target]);
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
