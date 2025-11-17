import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { OnInit } from '@angular/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss']
})
export class NavbarComponent implements OnInit {
  pageTitle = '';

  titles: any = {
    '/accueil': 'Accueil',
    '/formulaire': 'Lettre fin de mission'
  };

  constructor(private router: Router) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.pageTitle = this.titles[event.url] || 'Mon application';
      });
  }

  ngOnInit() {
    const currentUrl = this.router.url;
    this.pageTitle = this.titles[currentUrl] || 'Mon application';
  }

  handleReturn() {
    const currentUrl = this.router.url;

    if (currentUrl === '/accueil') {
      this.router.navigate(['/login']);
    } else {
      this.router.navigate(['/accueil']);
    }
  }
}
