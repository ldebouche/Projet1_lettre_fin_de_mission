import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';

@Component({
  selector: 'section-charges-personnel-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty
  ],
  templateUrl: './charges-personnel-component.html',
  styleUrl: './charges-personnel-component.scss'
})
export class ChargesPersonnelComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() anneeN1Existe: boolean = true;
  @Input() infoChargesPersonnel: any

  indicateurs: any[] = [];

  ngOnInit() {
    this.indicateurs = [
      { label: "Charges personnel", keys: { n: "CP_N", n1: "CP_N1", var: "CP_Var", pctVar: "CP_%Var" } },
      { label: "% du chiffre d'affaires", keys: { n: "CP_%caN", n1: "CP_%caN1" } },
      { label: "% de la marge brute globale", keys: { n: "CP_%margeN", n1: "CP_%margeN1" } },
      { 
        label: "Nombre d'heures rémunérées", 
        keys: { 
          n: this.group.get('heuresRemunN')?.value, 
          n1: this.group.get('heuresRemunN1')?.value, 
          var: "CP_heureVar", 
          pctVar: "CP_%heureVar" 
        } 
      },
      { label: "Coût de revient horaire", keys: { n: "CP_coutHorN", n1: "CP_coutHorN1" } },
    ];
  }

  getValue(key?: string, isPercent: boolean = false): string {
    if (!key) return '';
    const val = this.infoChargesPersonnel[key];
    if (val == null || val === '') return '';

    if (isPercent && (val < -100 || val > 100)) return 'NS'; 

    return isPercent 
      ? Number(val).toFixed(2)
      : Math.round(Number(val)).toLocaleString('fr-FR'); 
  }
}
