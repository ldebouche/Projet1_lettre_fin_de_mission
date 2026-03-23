import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly collaborateurSubject = new BehaviorSubject<any>(this.readCollaborateurFromStorage());
  collaborateur$ = this.collaborateurSubject.asObservable();

  setCollaborateur(collab: any) {
    localStorage.setItem('collaborateur', JSON.stringify(collab));
    this.collaborateurSubject.next(collab);
  }

  clearCollaborateur() {
    localStorage.removeItem('collaborateur');
    this.collaborateurSubject.next(null);
  }

  private readCollaborateurFromStorage() {
    const raw = localStorage.getItem('collaborateur');
    return raw ? JSON.parse(raw) : null;
  }

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
    localStorage.setItem('nomEntreprise', nom);
  }

  getNomEntreprise(): string | null {
    return localStorage.getItem('nomEntreprise') || null;
  }

  clearData() {
    localStorage.removeItem('nomEntreprise');
    localStorage.removeItem('codeClient');
    localStorage.removeItem('dateDebutEx');
    localStorage.removeItem('dateFinEx');
  }

  setModeLFM(mode: string) {
    localStorage.setItem('modeLFM', mode);
  }

  getModeLFM(): string | null {
    return localStorage.getItem('modeLFM') || null;
  }
}
