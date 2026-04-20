import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';

@Component({
  selector: 'section-impot-societes-tab-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty
  ],
  templateUrl: './impot-societes-tab-component.html',
  styleUrl: './impot-societes-tab-component.scss'
})
export class ImpotSocietesTabComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() infoIS: any

  choixMontant: string = '';

  ngOnInit() {
    if (!this.group) return;
    
    this.choixMontant = this.group.get('choixMontant')?.value;

    this.group.get('acomptes')?.valueChanges.subscribe(() => this.updateComputedValues());

    this.updateComputedValues();
  }

  getValue(key?: string, isPercent: boolean = false, isVariation: boolean = false): string {
  if (!key) return '';
  const val = this.infoIS[key];
  if (val == null || val === '') return '';

  if (isPercent && isVariation && (val < -100 || val > 100)) return 'NS'; 

  return isPercent 
    ? Number(val).toFixed(2)
    : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }

  updateComputedValues(): void {
    const acomptes = Number(this.group.get('acomptes')?.value ?? 0) || 0;
    const IS_tot = Number(this.infoIS?.IS_tot) || 0;
    const IS_credit = Number(this.infoIS?.IS_credit) || 0;
    
    this.infoIS.IS_acomptes = acomptes;

    const montant = IS_tot - IS_credit - acomptes;
    this.infoIS.IS_montant = montant;
  }
}
