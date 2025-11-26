import { Injectable } from '@angular/core';
import { MsalService } from '@azure/msal-angular';

@Injectable({ providedIn: 'root' })
export class AuthService {

  constructor(private msalService: MsalService) {}

  getEmail(): string | null {
    const account = this.msalService.instance.getActiveAccount();
    console.log('Active account:', account);
    if (!account) return null;

    return account.username;
  }
}
