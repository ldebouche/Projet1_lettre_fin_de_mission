import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class IdleService {
  private timeoutId: any;
  private readonly MAX_IDLE_TIME = 20 * 60 * 1000;

  constructor(private router: Router) {
    this.initListeners();
    this.resetTimer();
  }

  private initListeners() {
    ['click', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event =>
      window.addEventListener(event, () => this.resetTimer())
    );
  }

  private resetTimer() {
    clearTimeout(this.timeoutId);

    this.timeoutId = setTimeout(() => {
      this.logout();
    }, this.MAX_IDLE_TIME);
  }

  private logout() {
    localStorage.removeItem('token');
    localStorage.setItem('logoutReason', 'Déconnexion pour inactivité');
    this.router.navigate(['/']);
  }
}
