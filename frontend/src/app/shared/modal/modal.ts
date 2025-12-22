import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true, // On le passe en standalone pour simplifier les imports
  imports: [CommonModule],
  templateUrl: './modal.html',
  styleUrl: './modal.scss'
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() isLarge = false;
  @Input() showCloseButton = true; // Option pour masquer le bouton "X"
  @Input() closeOnBackdropClick = true; // Permet de fermer en cliquant sur le fond

  @Output() closeEvent = new EventEmitter<void>();

  closeModal() {
    this.closeEvent.emit();
  }
}
