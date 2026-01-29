import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { MsalService } from '@azure/msal-angular';

import { DataService } from '../../services/data-service';

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

  constructor(
    private router: Router,
    private location: Location,
    private msalService: MsalService,
    private dataService: DataService
  ) {
    this.router.events.subscribe(() => {
      this.currentUrl = this.router.url;
    });
  }

  ngOnInit() {
    this.currentUrl = this.router.url;
    this.dataService.collaborateur$.subscribe((collab) => {
      console.log(collab);
      this.collaborateur = collab;
      this.collaborateur.groupes_microsoft.includes('admin') ? this.hasRole = true : this.hasRole = false;
    });
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
    if (target) {
      this.router.navigate([target]);
    }
  }

  logout() {
    this.dataService.clearData();
    this.dataService.clearCollaborateur();

    this.msalService.instance.logoutRedirect({
      account: this.msalService.instance.getActiveAccount(),
      postLogoutRedirectUri: "https://outils-avenia.fr/"
    });
  }
}
