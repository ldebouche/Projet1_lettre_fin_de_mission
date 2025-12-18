import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DataService {
  private codeClient?: string;
  private dateDebutEx?: string;
  private nomEntreprise?: string;

  setCodeClient(code: string) {
    localStorage.setItem('codeClient', code);
  }

  getCodeClient(): string | null {
    return localStorage.getItem('codeClient') || null;
  }

  setDateDebutEx(date: string): void {
    localStorage.setItem('dateDebutEx', date);
  }

  getDateDebutEx(): string | null {
    return localStorage.getItem('dateDebutEx') || null;
  }

  setDateFinEx(date: string): void {
    localStorage.setItem('dateFinEx', date);
  }

  getDateFinEx(): string | null {
    return localStorage.getItem('dateFinEx') || null;
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
