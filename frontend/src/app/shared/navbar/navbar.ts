import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { MsalService } from '@azure/msal-angular';

import { DataService } from '../../services/data-service';
import { RolesService } from '../../services/roles-service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    RouterModule,
    CommonModule
  ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss']
})
export class NavbarComponent implements OnInit {
  currentUrl: string = '';
  collaborateur: any;
  hasRole: boolean = false;

  adminMenuOpen = false;

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
    });
  }

  ngOnInit() {
    this.currentUrl = this.router.url;

    this.dataService.collaborateur$.subscribe((collab) => {
      this.collaborateur = collab;

      this.hasRole = this.rolesService.hasRoles(this.collaborateur?.groupes_microsoft || [], ["admin", "informatique"]);
    });
  }

  toggleAdminMenu() {
    this.adminMenuOpen = !this.adminMenuOpen;
  }

  closeAdminMenu() {
    this.adminMenuOpen = false;
  }

  handleReturn() {
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
