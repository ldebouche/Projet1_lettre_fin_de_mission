import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class RolesService {
  private allRoles = ["collaborateur", "informatique", "general", "respdossiers", "copil", "rh", "finance", "cac", "secretariat", "admin"];

  public hasRoles(userRoles: string[], requiredRoles: string[]): boolean {
    if (!userRoles || userRoles.length === 0) {
      return false;
    }

    return requiredRoles.some(r => userRoles.includes(r))
  }
}
