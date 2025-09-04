import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);
  baseUrl = 'http://localhost:4000';

  generateComment(consigne: string, contexte: any, route: 'local'|'cloud'|'auto', containsSensitive: boolean) {
    return this.http.post<{ text: string }>(`${this.baseUrl}/api/generate-comment`, {
      consigne, contexte, route, containsSensitive
    }).pipe(map(r => r.text));
  }

  pipelineAnalyse(payload: any) {
    return this.http.post<{ text: string }>(`${this.baseUrl}/api/pipeline/analyse`, payload).pipe(map(r => r.text));
  }
}
