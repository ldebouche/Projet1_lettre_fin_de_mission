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
  @Input() isAssoc: boolean = false;

  get capaAutfinance(): number {
    if (!this.group) return 0;
    
    return (
      (this.group.get('resEx')?.value || 0) +
      (this.group.get('dot')?.value || 0) -
      (this.group.get('rembours')?.value || 0) -
      (this.group.get('divi')?.value || 0)
    );
  }

  getValue(val?: any): string {
    if (val == null || val === '') return '0';

    return Math.round(Number(val)).toLocaleString('fr-FR'); 
  }
}
