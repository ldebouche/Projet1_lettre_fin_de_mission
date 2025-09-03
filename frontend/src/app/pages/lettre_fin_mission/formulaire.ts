import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-formulaire',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './formulaire.html',
  styleUrls: ['./formulaire.scss']
})
export class FormulaireComponent {
  form: FormGroup;

  informations_fiscales = [
    'Rénovation et taux réduit de TVA',
    "Prestataire sous-traitant : l’attestation de vigilance",
    'Utilisation de une ou plusieurs caisses enregistreuses / système info de caisse',
    'Créances irrécouvrables',
    'Rupture dans une séquence de numérotation de facturation',
    'Perte de la moitié de capital social',
    'Comptes courants débiteurs',
    'Obligation FEC (pour les comptabilités externes)',
    'Obligation des entreprises individuelles',
    'Déclaration de revenus : obligation du gérant de transmettre les documents aux associés',
    'Non affiliation à la médecine du travail'
  ];

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      // ===== CHIFFRES CLÉS =====
      chiffresCles: this.fb.group({
        progressionChiffre: this.fb.group({
          enabled: [false],
          commentaire: ['']
        }),
        tauxMarge: this.fb.group({
          enabled: [false],
          commentaire: ['']
        })
      }),

      // ===== ÉVOLUTION CHARGES EXTERNES & AUTRES ACHATS =====
      evolutionCharges: this.fb.group({
        masquerSection: [false],
        montantVariationMin: [0.00],
        variation: this.fb.group({
          enabled: [false],
          commentaire: ['']
        })
      }),

      // ===== CHARGES DE PERSONNEL =====
      chargesPersonnel: this.fb.group({
        heuresRemunN: [0.00],
        heuresRemunN1: [0.00],
        annexeCotisationsEnabled: [false]
      }),

      // ===== INVESTISSEMENTS =====
      investissement: this.fb.group({
        masquerSection: [false],
        commentaire: [''],
        dotAmortissN: [0.00],
        dotAmortissN1: [0.00],
        dotAmortissN2: [0.00],
        immobilisationEnabled: [false]
      }),

      // ===== IMPÔT SUR LES SOCIÉTÉS TABLEAU =====
      impotSocietesTab: this.fb.group({
        masquerSection: [false],
      }),

      // ===== ACOMPTES IMPÔT SUR LES SOCIÉTÉS N+1 TABLEAU =====
      acomptesImpotSocietesN1Tab: this.fb.group({
        masquerSection: [false],
      }),

      // ===== IMPÔT SUR LES SOCIÉTÉS COMMENTAIRE =====
      impotSocietesCom: this.fb.group({
        masquerSection: [false],
        commentaire: ['']
      }),

      // ===== INFORMATION FISCALE =====
      informationFiscale: this.fb.array(
        this.informations_fiscales.map(() => this.fb.control(false))
      ),

      // ===== PROJET D’AFFECTATION DU RÉSULTAT =====
      projetResultat: this.fb.group({
        resultatExercice: [0.00],
        reserveLegale: [0.00],
        reserveOrdinaire: [0.00],
        reportNouveau: [0.00],
        dividendes: [0.00]
      }),

      // ===== TABLEAU D’AUTOFINANCEMENT =====
      tableauAutofinancement: this.fb.group({
        enabled: [false]
      }),

      // ===== ESTIMATION D’AUTOFINANCEMENT SUR LA BASE D'UNE HYPOTHESE DE MAINTIEN DU RÉSULTAT ACTUEL =====
      estimationAutof: this.fb.group({
        enabled: [false],
        resultatExercice: [0.00],
        dotations: [0.00],
        remboursements: [0.00],
        dividendes: [0.00],
        capaciteNet: [0.00],
        majDocEvalEnabled: [false],
        protectionSocialeEnabled: [false]
      }),

      // ===== FAITS MARQUANTS DE L'EXERCICE =====
      faitsMarquants: this.fb.group({
        enabled: [false],
        commentaire: [''],
        commentairesRevision: [false],
        justificationsDemandes: [false]
      }),

      // ===== LES PERSPECTIVES =====
      perspectives: this.fb.group({
        mesuresEnabled: [false],
        commentaire: ['']
      }),

      // ===== SIGNATAIRE =====
      signataire: this.fb.group({
        nomExpert: [''],
        qualiteExpert: [''],
        nomReviseur: [''],
        qualiteReviseur: ['']
      })
    });
  }

  get f() { return this.form.controls as any; }
  get infoFiscale(): FormArray { return this.form.get('informationFiscale') as FormArray; }

  onSubmit() {
    console.log('Formulaire envoyé :', this.form.value);
  }
}
