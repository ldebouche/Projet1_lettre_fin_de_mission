import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);

  generateComment(type: string, contexte: any) {
    return this.http.post<{ text: string }>(`/api/ai/generate-comment`, { type, contexte }).pipe(map(r => r.text));
  }

  pipelineAnalyse(contexte: any) {
    return this.http.post<{ text: string }>(`/api/pipeline/analyse`, contexte).pipe(map(r => r.text));
  }
}
