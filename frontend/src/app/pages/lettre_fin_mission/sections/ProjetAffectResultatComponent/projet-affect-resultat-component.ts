import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { DbService } from '../../../../services/db-service';
import { ZeroIfEmpty } from '../../../../directives/zero-if-empty';

@Component({
  selector: 'section-projet-affect-resultat-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    ZeroIfEmpty
  ],
  templateUrl: './projet-affect-resultat-component.html',
  styleUrl: './projet-affect-resultat-component.scss'
})
export class ProjetAffectResultatComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() resEx = 0;
  @Input() affectation = '';

  messageErreur: string | null = null;

  ngOnInit() {
    const res = this.resEx.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    this.group.valueChanges.subscribe(values => {
      const total = ((values.resLeg || 0) + (values.resOrd || 0) + (values.report || 0) + (values.affect || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      if (total != res) {
        this.messageErreur = `⚠️ La somme des affectations (${total} €) est différente du résultat de l’exercice (${res} €).`;
      } else {
        this.messageErreur = null;
      }
    });
  }
}