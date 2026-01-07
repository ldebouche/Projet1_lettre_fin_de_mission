import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-bouton-filtre',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './bouton-filtre.html',
  styleUrl: './bouton-filtre.scss',
})
export class BoutonFiltreComponent {
  @Input() label = '';

  @Input() direction: 'asc' | 'desc' = 'desc';

  @Input() active = true;

  @Input() filterIconSrc = '/assets/icons/filtre.png';

  @Output() clicked = new EventEmitter<void>();
}
