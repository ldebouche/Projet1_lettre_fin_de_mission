import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DataService {
  private codeClient?: string;
  private dateDebutEx?: string;

  setCodeClient(code: string) {
    this.codeClient = code;
    localStorage.setItem('codeClient', code);
  }

  getCodeClient(): string | null {
    if (!this.codeClient) {
      this.codeClient = localStorage.getItem('codeClient') || undefined;
    }
    return this.codeClient || null;
  }

  setDateDebutEx(date: string): void {
    this.dateDebutEx = date;
    localStorage.setItem('dateDebutEx', date); // ou sessionStorage
  }

  // --- Getter
  getDateDebutEx(): string | null {
    if (!this.dateDebutEx) {
      this.dateDebutEx = localStorage.getItem('dateDebutEx') || undefined;
    }
    return this.dateDebutEx || null;
  }
}
