import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormArray, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { DbService } from '../../../../services/db-service';

@Component({
  selector: 'section-info-fiscale-component',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './info-fiscale-component.html',
  styleUrls: ['./info-fiscale-component.scss']
})
export class InfoFiscaleComponent implements OnInit {
  @Input() formArray!: FormArray<FormControl<boolean>>;
  @Input() items: string[] = [];

  info1 = false;
  info2 = false;
  info3 = false;
  info4 = false;
  info5 = false;
  info6 = false;
  info7 = false;
  info8 = false;
  info9 = false;

  constructor(private db: DbService) {}

  ngOnInit() {
    this.db.GetInfoFiscale().subscribe({
      next: (data: any) => {
        this.info1 = data.info1;
        this.info2 = data.info2;
        this.info3 = data.info3;
        this.info4 = data.info4;
        this.info5 = data.info5;
        this.info6 = data.info6;
        this.info7 = data.info7;
        this.info8 = data.info8;
        console.log(data);
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
      }
    });
  }

  shouldDisplay(item: string): boolean {
    if (item === 'Rénovation et taux réduit de TVA' && !this.info1) return false;
    if (item === 'Prestataire sous-traitant : l\'attestation de vigilence' && !this.info2) return false;
    if (item === 'Utilisation de une ou plusieurs caisses enregistreuses ou d\'un système informatique de caisse' && !this.info3) return false;
    if (item === 'Créances irrécouvrables' && !this.info4) return false;
    if (item === 'Rupture dans une séquence de numérotation de facturation' && !this.info5) return false;
    if (item === 'Obligation FEC (pour les comptabilités externes)' && !this.info6) return false;
    if (item === 'Obligation des entreprises individuelles' && !this.info7) return false;
    if (item === 'Déclaration de revenus : obligation du gérant de transmettre les documents aux associés' && !this.info8) return false;
    return true;
  }
}
