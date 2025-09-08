import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private http = inject(HttpClient);
  baseUrl = 'http://localhost:4000';

  testDb(nom: any) {
    return this.http.post<{ text: string }>(`${this.baseUrl}/api/testDb`, { contexte: { nom } }).pipe(map(r => r.text));
  }

  getClientNom(code_client: any) {
    return this.http.get<string>(`${this.baseUrl}/api/testDb/${code_client}`);
  }

  VerifDossier(code_client: any, dateFinEx: Date) {
    return this.http.get<{ code_client: any, dateFinEx: Date }>(`${this.baseUrl}/api/db/verifDossier/${code_client}/${dateFinEx}`);
  }
}
