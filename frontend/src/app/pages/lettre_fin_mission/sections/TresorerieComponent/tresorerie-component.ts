import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-tresorerie-component',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './tresorerie-component.html',
  styleUrl: './tresorerie-component.scss'
})
export class TresorerieComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;

  messageErreur: string | null = null;
  tresorerieNCalculee: number = 0;
  tresorerieNTheorique: number = 0;
  
  ngOnInit() {
    if (!this.group) return;
    
    this.tresorerieNTheorique = this.group.get('tresoN')?.value || 0;

    const initial = this.group.value;
    this.calculerTreso(initial);

    this.group.valueChanges.subscribe(values => {
      this.calculerTreso(values);
    });
  }

  private calculerTreso(values: any) {
    console.log('Calcul de la trésorerie avec les valeurs :', values);
    this.tresorerieNCalculee =
      (values.tresoN1 || 0) +
      (values.CAF || 0) +
      (values.RF_apport || 0) +
      (values.RF_emprunts || 0) +
      (values.RF_invest || 0) +
      (values.RF_autre || 0) -
      (values.EF_invest || 0) -
      (values.EF_emprunts || 0) -
      (values.EF_retraits || 0) -
      (values.EF_divi || 0) -
      (values.V_stock || 0) -
      (values.V_creances || 0) +
      (values.V_dettes || 0) -
      (values.V_autresCreances || 0) +
      (values.V_autresDettes || 0);

    if (this.tresorerieNCalculee !== this.tresorerieNTheorique) {
      this.messageErreur = `⚠️ Le solde de la trésorerie calculé (${this.getValue(this.tresorerieNCalculee)} €) est différent du solde de la trésorerie théorique (${this.getValue(this.tresorerieNTheorique)} €).\nL'écart est de ${this.getValue(this.tresorerieNCalculee - this.tresorerieNTheorique)} €.`;
    } else {
      this.messageErreur = null;
    }
  }

  getValue(val: any): string {
    if (val == null || val === '') return '';

    return Math.round(Number(val)).toLocaleString('fr-FR'); 
  }
}
