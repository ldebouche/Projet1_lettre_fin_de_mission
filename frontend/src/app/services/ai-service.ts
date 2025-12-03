import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);

  generateComment(type: string, contexte: any) {
    return this.http.post<any>(`/api/ai/generate-comment`, { type, contexte });
  }
}
