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
import { WordService } from '../../services/word-service';

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
  resEx = 0;
  forme_societe = '';
  categorie_revenu = '';
  signataire = {
    nomExpert: '',
    prenomExpert: '',
    nomReviseur: '',
    prenomReviseur: ''
  };

  choixAffectation = [
    "Fonds associatifs",
    "Dividendes",
    "Au prorata des comptes courants d’associés"
  ];
  affectation = this.choixAffectation[0];
  valeurReserveLegale = 0;
  valeurReserveOrdinaire = 0;
  valeurReportNouveau = 0;
  valeurAffectation = 0;

  capitalSocial = 0;
  montantReserveLegale = 0;
  montantReserveOrdinaire = 0;
  montantReportNouveau = 0;
  montantDividendesN1 = 0;

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
      'Protection sociale'
    ];

  constructor(
    private fb: FormBuilder,
    private db: DbService,
    private wordService: WordService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.db.GetDossierInfos().subscribe({
      next: (data: any) => {
        this.anneeN1Existe = data.anneeN1Existe;
        this.resEx = data.resEx;
        this.forme_societe = data.forme_societe;
        this.categorie_revenu = data.categorie_revenu;
        this.signataire = data.signataire;

        if (this.forme_societe.startsWith("ASS")){
          this.affectation = this.choixAffectation[0];
          this.valeurAffectation = this.resEx;
        } else if (this.forme_societe == "SCI" && this.categorie_revenu == "rfonc") {
          this.affectation = this.choixAffectation[2];
          if (this.resEx > 0) {
            this.valeurAffectation = this.resEx;
          } else {
            this.valeurReportNouveau = this.resEx;
          }
        } else {
          this.affectation = this.choixAffectation[1];
          this.valeurAffectation = this.montantDividendesN1;
          if (this.resEx > 0) {
            if (this.montantReserveLegale == this.capitalSocial * 0.1) {
              this.valeurReserveLegale = 0;
              this.valeurReserveOrdinaire = this.resEx;
            } else if (this.montantReserveLegale < this.capitalSocial * 0.1 && this.capitalSocial * 0.1 - this.montantReserveLegale - this.resEx <= 0) {
              this.valeurReserveLegale = this.capitalSocial * 0.1 - this.montantReserveLegale;
              this.valeurReserveOrdinaire = this.resEx - this.valeurReserveLegale;
            } else if (this.montantReserveLegale < this.capitalSocial * 0.1 && this.capitalSocial * 0.1 - this.montantReserveLegale - this.resEx > 0) {
              this.valeurReserveLegale = this.resEx;
              this.valeurReserveOrdinaire = 0;
            }
          } else if (this.resEx < 0) {
            if (this.resEx + this.montantReserveOrdinaire >= 0) {
              this.valeurReserveOrdinaire -= this.resEx;
            } else {
              this.valeurReportNouveau = this.resEx + this.montantReserveOrdinaire;
            }
          }
        };
        this.form.patchValue({
          projetResultat: {
            reserveLegale: Number(this.valeurReserveLegale.toFixed(2)),
            reserveOrdinaire: Number(this.valeurReserveOrdinaire.toFixed(2)),
            reportNouveau: Number(this.valeurReportNouveau.toFixed(2)),
            affectation: Number(this.valeurAffectation.toFixed(2))
          },
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
      // ===== DONNEES HORS FORMULAIRE =====
      nomEntreprise: ['aaa'],
      adresseEntreprise: [''],
      codePostalClient: [''],
      villeClient: [''],
      lieuCreation: [''],
      dateCreation: [''],
      initialesChefGroupe: [''],
      codeClient: [''],
      dateFinEx: [''],

      // ===== CHIFFRES CLÉS =====
      chiffresCles: this.fb.group({
        progressionChiffre: this.fb.group({
          commentaire: ['test commentaire']
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
        affectation: [0.00]
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
    const formData = this.form.value;

    const infoArray: boolean[] = formData.informationFiscale;

    const hasAny = infoArray.some(v => v === true);

    const infoFlags = this.informations_fiscales.reduce((acc, label, idx) => {
      const key = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      acc[key] = infoArray[idx];
      return acc;
    }, {} as Record<string, boolean>);

    const payload = {
      ...formData,
      informationFiscaleArray: infoArray,
      informationFiscale: infoFlags,
      informationFiscale_hasAny: hasAny,
      anneeN1Existe: this.anneeN1Existe
    };

    this.wordService.generateWord(payload).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'LFM_test.docx'; 
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
