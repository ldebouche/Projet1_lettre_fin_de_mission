import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MsalService } from '@azure/msal-angular';

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

  constructor(
    private router: Router,
    private msalService: MsalService
  ) {
    this.router.events.subscribe(() => {
      this.currentUrl = this.router.url;
    });
  }

  ngOnInit() {
    this.currentUrl = this.router.url;
  }

  handleReturn() {
    if (this.currentUrl === '/lettre-fin-mission') {
      this.router.navigate(['/accueil-mission']);
    } else if (this.currentUrl === '/accueil-mission') {
      this.router.navigate(['/login-dossier']);
    } else if (this.currentUrl === '/login-dossier') {
      this.router.navigate(['/dashboard']);
    } else if (this.currentUrl === '/dashboard') {
      this.router.navigate(['/accueil-intranet']);
    }
  }

  logout() {
    this.msalService.instance.logoutRedirect({
      account: this.msalService.instance.getActiveAccount(),
      onRedirectNavigate: (url) => {
        this.msalService.instance.setActiveAccount(null);
        setTimeout(() => {
          this.router.navigateByUrl('/refresh', { skipLocationChange: true }).then(() => {
            this.router.navigateByUrl('/');
          });
        }, 0);

        return false;
      }
    });
  }
}
