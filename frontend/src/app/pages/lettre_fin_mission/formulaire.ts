import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { ChiffresClesComponent } from './sections/ChiffresClesComponent/chiffres-cles-component';
import { EvolutionChargesComponent } from './sections/EvolutionChargesComponent/evolution-charges-component';
import { ChargesPersonnelComponent } from './sections/ChargesPersonnelComponent/charges-personnel-component';
import { InvestissementComponent } from './sections/InvestissementComponent/investissement-component';
import { ImpotSocietesTabComponent } from './sections/ImpotSocietesTabComponent/impot-societes-tab-component';
import { AcompteImpotComponent } from './sections/AcompteImpotComponent/acompte-impot-component';
import { ImpotSocieteCommComponent } from './sections/ImpotSocieteCommComponent/impot-societe-comm-component';
import { InfoFiscaleComponent } from './sections/InfoFiscaleComponent/info-fiscale-component';
import { ProjetAffectResultatComponent } from './sections/ProjetAffectResultatComponent/projet-affect-resultat-component';
import { TabAutofinancementComponent } from './sections/TabAutofinancementComponent/tab-autofinancement-component';
import { EstimAutofinancementComponent } from './sections/EstimAutofinancementComponent/estim-autofinancement-component';
import { MAJDocUniqueEvalComponent } from './sections/MAJDocUniqueEvalComponent/majdoc-unique-eval-component';
import { FaitsMarquantsComponent } from './sections/FaitsMarquantsComponent/faits-marquants-component';
import { PerspectivesComponent } from './sections/PerspectivesComponent/perspectives-component';
import { SignataireComponent } from './sections/SignataireComponent/signataire-component';

import { DbService } from '../../services/db-service';

@Component({
  selector: 'app-formulaire',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ChiffresClesComponent,
    EvolutionChargesComponent,
    ChargesPersonnelComponent,
    InvestissementComponent,
    ImpotSocietesTabComponent,
    AcompteImpotComponent,
    ImpotSocieteCommComponent,
    InfoFiscaleComponent,
    ProjetAffectResultatComponent,
    TabAutofinancementComponent,
    EstimAutofinancementComponent,
    MAJDocUniqueEvalComponent,
    FaitsMarquantsComponent,
    PerspectivesComponent,
    SignataireComponent
  ],
  templateUrl: './formulaire.html',
  styleUrls: ['./formulaire.scss']
})
export class FormulaireComponent implements OnInit {
  showTextarea = false;
  commentaire = '';
  form!: FormGroup;
  loading = false;

  anneeN1Existe = true;
  ei = false;

  signataire = {
    nomExpert: '',
    prenomExpert: '',
    nomReviseur: '',
    prenomReviseur: ''
  };

  resEx = 0;
  
  informations_fiscales = [
      'Rénovation et taux réduit de TVA',
      "Prestataire sous-traitant : l\'attestation de vigilence",
      'Utilisation de une ou plusieurs caisses enregistreuses ou d\'un système informatique de caisse',
      'Créances irrécouvrables',
      'Rupture dans une séquence de numérotation de facturation',
      'Perte de la moitié de capital social',
      'Comptes courants débiteurs',
      'Obligation FEC (pour les comptabilités externes)',
      'Obligation des entreprises individuelles',
      'Déclaration de revenus : obligation du gérant de transmettre les documents aux associés',
      'Non affiliation à la médecine du travail',
      'Retard dépot déclaration fiscale : retard dépot documents',
      'Retard dépot déclaration fiscale : retard règlement honoraires',
      'Réduction d\'impôt frais de comptabilité',
      'Protection sociale'
    ];

  constructor(
    private fb: FormBuilder,
    private db: DbService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.db.GetDossierInfos().subscribe({
      next: (data: any) => {
        this.anneeN1Existe = data.anneeN1Existe;
        this.ei = data.ei;
        this.resEx = data.resEx;
        this.signataire = data.signataire;
        
        this.form.patchValue({
          signataire: {
            nomExpert: this.signataire.nomExpert + " " + this.signataire.prenomExpert,
            qualiteExpert: 'Expert-Comptable',
            nomReviseur: this.signataire.nomReviseur + " " + this.signataire.prenomReviseur,
            qualiteReviseur: 'Chef de groupe'
          }
        });
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
        this.loading = false;
      }
    });
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      // ===== CHIFFRES CLÉS =====
      chiffresCles: this.fb.group({
        progressionChiffre: this.fb.group({
          commentaire: ['']
        }),
        tauxMarge: this.fb.group({
          commentaire: ['']
        })
      }),

      // ===== ÉVOLUTION CHARGES EXTERNES & AUTRES ACHATS =====
      evolutionCharges: this.fb.group({
        masquerSection: [false],
        montantVariationMin: [0.00],
        montantVariationMinPourcentage: [0.00],
        montantMinAffiché: [0.00],
        commentaire: ['']
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

      // ===== IMPÔT SUR LES SOCIÉTÉS (TABLEAU) =====
      impotSocietesTab: this.fb.group({
        masquerSection: [false],
      }),

      // ===== ACOMPTES IMPÔT SUR LES SOCIÉTÉS N+1 (TABLEAU) =====
      acomptesImpotSocietesN1Tab: this.fb.group({
        masquerSection: [false],
      }),

      // ===== IMPÔT SUR LES SOCIÉTÉS (COMMENTAIRE) =====
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
        capaciteNet: [0.00]
      }),

      // ===== MISE A JOUR DU DOCUMENT UNIQUE D’EVALUATION DES RISQUES PROFESSIONNELS DE L’ENTREPRISE =====
      majDocEval: this.fb.group({
        enabled: [false]
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
        commentaire: ['']
      }),

      // ===== SIGNATAIRE =====
      signataire: this.fb.group({
        nomExpert: [this.signataire?.nomExpert],
        qualiteExpert: ['Expert-Comptable'],
        nomReviseur: [this.signataire?.nomReviseur],
        qualiteReviseur: ['Chef de groupe']
      })
    });
  }

  get f() { return this.form.controls as any; }
  get infoFiscale(): FormArray { return this.form.get('informationFiscale') as FormArray; }

  onSubmit() {
    console.log('Formulaire envoyé :', this.form.value);
  }
}
