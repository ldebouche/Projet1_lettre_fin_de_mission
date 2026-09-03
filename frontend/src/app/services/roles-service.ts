import { Injectable } from '@angular/core';

export const GROUPES_CARTOGRAPHIE = ['admin', 'informatique', 'copil'];
export const GROUPES_TOUS_DOSSIERS = ['informatique'];
export const GROUPES_TOUS_PROSPECTS = ['admin', 'informatique', 'copil'];

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
