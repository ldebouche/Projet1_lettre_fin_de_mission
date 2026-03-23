import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.html',
  styleUrls: ['./modal.scss']
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() isLarge = false;
  @Input() showCloseButton = true;
  @Input() closeOnBackdropClick = true;

  @Output() closeEvent = new EventEmitter<void>();

  closeModal() {
    this.closeEvent.emit();
  }
}
