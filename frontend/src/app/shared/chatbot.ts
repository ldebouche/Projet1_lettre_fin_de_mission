import { Component, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

import { AiService } from '../services/ai-service';

export interface ChatSource {
  fileName: string;
  url: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

marked.setOptions({
  async: false
});

@Component({
  selector: 'app-chatbot',
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './chatbot.html',
  styleUrl: './chatbot.scss'
})
export class ChatbotComponent implements AfterViewChecked {
  isOpen = false;
  messages: ChatMessage[] = [
    { role: 'assistant', content: 'Bonjour ! Comment puis-je vous aider ?', sources: [] }
  ];

  userInput = '';

  constructor(
    private aiService: AiService,
    private sanitizer: DomSanitizer
  ) {}

  parseMarkdown(content: string): SafeHtml {
    const html = marked.parse(content) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
  }

  closeChat() {
    this.isOpen = false;
  }

  sendMessage() {
    if (!this.userInput.trim()) return;

    this.messages.push({ role: 'user', content: this.userInput });
    const question = this.userInput;
    this.userInput = '';
    
    this.aiService.askChatbot(question, this.messages).subscribe({
      next: (res) => {
        console.log("Réponse du chatbot :", res.sources);
        this.messages.push({ role: 'assistant', content: res.reply, sources: res.sources });
      },
      error: (err) => {
        this.messages.push({ role: 'assistant', content: "Désolé, une erreur est survenue. Veuillez réessayer plus tard.", sources: [] });
      }
    });
  }

  ngAfterViewChecked() {
    const container = document.querySelector('.chatbot-body');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
