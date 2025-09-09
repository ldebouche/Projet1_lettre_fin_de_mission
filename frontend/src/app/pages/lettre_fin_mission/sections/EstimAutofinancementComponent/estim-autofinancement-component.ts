import { Component , Input } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-estim-autofinancement-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './estim-autofinancement-component.html',
  styleUrl: './estim-autofinancement-component.scss'
})
export class EstimAutofinancementComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() resEx = 0;

  get capaAutfinance(): number {
    return (
      this.resEx +
      (this.group.get('dotations')?.value || 0) -
      (this.group.get('remboursements')?.value || 0) -
      (this.group.get('dividendes')?.value || 0)
    );
  }
}
