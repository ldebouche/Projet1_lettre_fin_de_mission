import { Component, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AiService } from '../services/ai-service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
    { role: 'assistant', content: 'Bonjour ! Comment puis-je vous aider ?' }
  ];

  userInput = '';

  constructor(private aiService: AiService) {}

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
        this.messages.push({ role: 'assistant', content: res.reply });
      },
      error: (err) => {
        this.messages.push({ role: 'assistant', content: "Désolé, une erreur est survenue. Veuillez réessayer plus tard." });
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
