import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DataService {
  private codeClient = '';

  setCodeClient(code: string) {
    this.codeClient = code;
  }

  getCodeClient(): string {
    return this.codeClient;
  }
}
