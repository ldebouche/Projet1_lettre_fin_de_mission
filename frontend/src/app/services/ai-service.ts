import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { ChatMessage } from '../shared/chatbot';

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);

  generateComment(type: string, contexte: any) {
    return this.http.post<any>(`/api/ai/generate-comment`, { type, contexte });
  }

  askChatbot(message: string, conversation: ChatMessage[] = []) {
    return this.http.post<any>(`/api/ai/chatbot`, { message, conversation })
  }
}
