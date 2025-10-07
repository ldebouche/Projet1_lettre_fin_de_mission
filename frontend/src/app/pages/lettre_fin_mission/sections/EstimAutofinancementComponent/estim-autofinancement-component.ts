import { Component , Input } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';

@Component({
  selector: 'section-estim-autofinancement-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty
  ],
  templateUrl: './estim-autofinancement-component.html',
  styleUrl: './estim-autofinancement-component.scss'
})
export class EstimAutofinancementComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() resEx = 0;
  @Input() dotation = 0;

  get capaAutfinance(): number {
    return (
      this.resEx +
      (this.dotation || 0) -
      (this.group.get('rembours')?.value || 0) -
      (this.group.get('divi')?.value || 0)
    );
  }
}
