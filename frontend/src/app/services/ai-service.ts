import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);
  baseUrl = 'http://localhost:4000';

  generateComment(contexte: any) {
    return this.http.post<{ text: string }>(`${this.baseUrl}/api/generate-comment`, { contexte }).pipe(map(r => r.text));
  }

  pipelineAnalyse(contexte: any) {
    return this.http.post<{ text: string }>(`${this.baseUrl}/api/pipeline/analyse`, contexte).pipe(map(r => r.text));
  }

  testDb(nom: any) {
    return this.http.post<{ text: string }>(`${this.baseUrl}/api/testDb`, { contexte: { nom } }).pipe(map(r => r.text));
  }

  getClientNom(code_client: any) {
    return this.http.get<string>(`${this.baseUrl}/api/testDb/${code_client}`);
  }
}
