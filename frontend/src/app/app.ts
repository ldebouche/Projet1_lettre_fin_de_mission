import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/navbar/navbar';
import { CommonModule } from '@angular/common';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import { EventMessage, EventType } from '@azure/msal-browser';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, 
    NavbarComponent,
    CommonModule
  ],
  template: `
    <app-navbar></app-navbar>
    <main class="p-6">
      <router-outlet></router-outlet>
    </main>
  `
})
export class AppComponent implements OnInit {
  constructor(
    private msalService: MsalService,
    private msalBroadcast: MsalBroadcastService
  ) {}

  ngOnInit() {
    this.msalBroadcast.msalSubject$
      .subscribe((message: EventMessage) => {
        if (message.eventType === EventType.LOGOUT_SUCCESS) {
          this.msalService.instance.setActiveAccount(null);
        } else if (message.eventType === EventType.LOGIN_SUCCESS) {
          const accounts = this.msalService.instance.getAllAccounts();
          if (accounts.length > 0) {
            this.msalService.instance.setActiveAccount(accounts[0]);
          }
        }
      });
  }
}