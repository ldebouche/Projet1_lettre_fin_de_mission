import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DataService {
  private codeClient?: string;
  private dateDebutEx?: string;
  private nomEntreprise?: string;

  setCodeClient(code: string) {
    this.codeClient = code;
  }

  getCodeClient(): string | null {
    return this.codeClient || null;
  }

  setDateDebutEx(date: string): void {
    this.dateDebutEx = date;
  }

  getDateDebutEx(): string | null {
    return this.dateDebutEx || null;
  }

  setNomEntreprise(nom: string) {
    this.nomEntreprise = nom;
  }

  getNomEntreprise(): string | null {
    return this.nomEntreprise || null;
  }

  clearData() {
    this.codeClient = undefined;
    this.dateDebutEx = undefined;
    this.nomEntreprise = undefined;
  }
}
