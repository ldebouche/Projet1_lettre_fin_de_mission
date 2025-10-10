import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-chiffres-cles',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
  ],
  templateUrl: './chiffres-cles-component.html',
  styleUrls: ['./chiffres-cles-component.scss']
})
export class ChiffresClesComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() infoChiffresCles: any;
  @Input() anneeN1Existe: boolean = true;
  @Input() dataPerspective: any;
  @Input() dataCA: any;
  @Input() anaSectorielle: any;

  indicateurs = [
    { label: "CA produit HT", keys: { n: "CC_caN", n1: "CC_caN1", var: "CC_caVar", pctVar: "CC_%caVar" }, force100: true },
    { label: "Marge brute", keys: { n: "CC_margeN", n1: "CC_margeN1", var: "CC_margeVar", pctN: "CC_%margeN", pctN1: "CC_%margeN1", pctVar: "CC_%margeVar" } },
    { label: "Excédent brut d'exploitation", keys: { n: "CC_excedN", n1: "CC_excedN1", var: "CC_excedVar", pctN: "CC_%excedN", pctN1: "CC_%excedN1", pctVar: "CC_%excedVar" } },
    { label: "Résultat courant", keys: { n: "CC_resCourantN", n1: "CC_resCourantN1", var: "CC_resCourantVar", pctN: "CC_%resCourantN", pctN1: "CC_%resCourantN1", pctVar: "CC_%resCourantVar" } },
    { label: "Résultat net", keys: { n: "CC_resNetN", n1: "CC_resNetN1", var: "CC_resNetVar", pctN: "CC_%resNetN", pctN1: "CC_%resNetN1", pctVar: "CC_%resNetVar" } },
  ];

  getValue(key?: string, isPercent: boolean = false): string {
    if (!key) return '';
    const val = this.infoChiffresCles[key];
    if (val == null || val === '') return '';

    if (isPercent && (val < -100 || val > 100)) return 'NS'; 

    return isPercent 
      ? Number(val).toFixed(2)
      : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }

  getTrancheKeys(tranches: any): string[] {
    const keys = Object.keys(tranches);
    // On met le dernier élément en premier
    if (keys.length > 1) {
      const last = keys.pop();
      if (last) keys.unshift(last);
    }
    return keys;
  }
  get progressionChiffre(): FormGroup {
    return this.group.get('progressionChiffre') as FormGroup;
  }

  get tauxMarge(): FormGroup {
    return this.group.get('tauxMarge') as FormGroup;
  }
}
