import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatbotSettingsService } from '../../../../services/chatbot-settings-service';

@Component({
  selector: 'app-tab-lien-externe',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule
  ],
  templateUrl: './tab-lien-externe.html'
})
export class TabLienExterneComponent {
  procedureName = '';
  externalLink = '';

  @Output() processingStart = new EventEmitter<{ title: string; message: string }>();
  @Output() processingEnd = new EventEmitter<{ title: string; message: string }>();

  constructor(
    private chatbotSettingsService: ChatbotSettingsService
  ) {}

  get boutonDesactive(): boolean {
    return !this.externalLink || !this.procedureName;
  }

  submit(): void {
    if (this.boutonDesactive) return;

    this.processingStart.emit({
      title: 'Création en cours',
      message: 'La procédure est en cours de création. Merci de patienter…'
    });

    this.chatbotSettingsService.CreateProcedureFromUrl(this.procedureName.trim(), this.externalLink.trim()).subscribe({
      next: () => {
        this.processingEnd.emit({
          title: 'Création terminée',
          message: 'La procédure a été créée avec succès.'
        });
      },
      error: () => {
        this.processingEnd.emit({
          title: 'Erreur',
          message: 'Une erreur est survenue lors de la création.'
        });
      }
    });
  }
}
