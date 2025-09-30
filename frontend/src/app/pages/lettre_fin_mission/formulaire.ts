import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { ChiffresClesComponent } from './sections/ChiffresClesComponent/chiffres-cles-component';
import { EvolutionChargesComponent } from './sections/EvolutionChargesComponent/evolution-charges-component';
import { ChargesPersonnelComponent } from './sections/ChargesPersonnelComponent/charges-personnel-component';
import { InvestissementComponent } from './sections/InvestissementComponent/investissement-component';
import { ImpotSocietesTabComponent } from './sections/ImpotSocietesTabComponent/impot-societes-tab-component';
import { AcompteImpotComponent } from './sections/AcompteImpotComponent/acompte-impot-component';
import { InfoFiscaleComponent } from './sections/InfoFiscaleComponent/info-fiscale-component';
import { ProjetAffectResultatComponent } from './sections/ProjetAffectResultatComponent/projet-affect-resultat-component';
import { EstimAutofinancementComponent } from './sections/EstimAutofinancementComponent/estim-autofinancement-component';
import { MAJDocUniqueEvalComponent } from './sections/MAJDocUniqueEvalComponent/majdoc-unique-eval-component';
import { FaitsMarquantsComponent } from './sections/FaitsMarquantsComponent/faits-marquants-component';
import { PerspectivesComponent } from './sections/PerspectivesComponent/perspectives-component';
import { SignataireComponent } from './sections/SignataireComponent/signataire-component';

import { DbService } from '../../services/db-service';
import { WordService } from '../../services/word-service';
import { PdfService } from '../../services/pdf-service';
import { of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

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
    InfoFiscaleComponent,
    ProjetAffectResultatComponent,
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
  commentaire = '';
  form!: FormGroup;
  loading = true;

  anneeN1Existe = true;
  I_classe2 = true;
  MD_salaries = true;
  imposable = true;
  moisClotureArray = [''];
  resEx = 0;
  forme_societe = '';
  categorie_revenu = '';

  phraseAcomptes = '';

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
  PA_affectation = this.choixAffectation[0];
  valeurReserveLegale = 0;
  valeurReserveOrdinaire = 0;
  valeurReportNouveau = 0;
  valeurAffectation = 0;

  capitalSocial = 0;
  montantReserveLegale = 0;
  montantReserveOrdinaire = 0;
  montantReportNouveau = 0;
  montantDividendesN1 = 0;

  dotations = [0, 0, 0];

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

  infoChargesPersonnel: any;
  infoImpotSociete: any;
  infoClient: any;
  infoChiffresCles: any;
  infoAutofinancement: any;
  infoEvolutionCharges: any;

  dataCA = {};
  dataMarge = {};
  anaSectorielle: any;
  
  constructor(
    private fb: FormBuilder,
    private db: DbService,
    private wordService: WordService,
    private pdfService: PdfService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    forkJoin({
      data: this.db.GetDossierInfos(),
      dotations: this.pdfService.getDotations()
    }).subscribe({
      next: ({ data, dotations }: any) => {
        console.log(data);
        this.dotations = Object.values(dotations);

        this.infoChargesPersonnel = data.chargesPersonnel;
        this.infoImpotSociete = data.impotSociete;
        this.infoClient = data.client;
        this.infoChiffresCles = data.chiffreCles;
        this.infoAutofinancement = data.autofinancement;
        this.loadEvoChargesWithComments(data.evolutionCharges);
        

        this.anneeN1Existe = data.anneeN1Existe;
        this.resEx = data.resEx;
        this.I_classe2 = data.I_classe2;
        this.MD_salaries = data.MD_salaries;
        this.imposable = data.imposable;
        this.forme_societe = data.forme_societe;
        this.categorie_revenu = data.categorie_revenu;
        this.signataire = data.signataire;

        this.dataCA = {
          caN: data.chiffreCles.CC_caN,
          caN1: data.chiffreCles.CC_caN1,
          caVar: data.chiffreCles.CC_caVar,
          "%caVar": data.chiffreCles["CC_%caVar"],
          anneeN: data.anneeN,
          anneeN1: data.anneeN1,
          compte207_credit: data.compte207_credit,
          compte207_debit: data.compte207_debit,
          produitsFinanciers: data.produitsFinanciers
        };

        this.dataMarge = {
          CC_margeN: data.chiffreCles.CC_margeN,
          "CC_%margeN": data.chiffreCles["CC_%margeN"],
          CC_margeN1: data.chiffreCles.CC_margeN1,
          "CC_%margeN1": data.chiffreCles["CC_%margeN1"],
          CC_margeVar: data.chiffreCles.CC_margeVar,
          "CC_%margeVar": data.chiffreCles["CC_%margeVar"],
          anneeN: data.chiffreCles.dateFinEx.split('/')[2],
          anneeN1: Number(data.chiffreCles.dateFinEx.split('/')[2]) - 1
        };

        this.anaSectorielle = data.anaSectorielle.valeurs;

        if (data.mois_cloture == 12 || data.mois_cloture == 1 || data.mois_cloture == 2) {
          this.moisClotureArray = ['03', '06', '09', '12'];
        } else if (data.mois_cloture == 3 || data.mois_cloture == 4 || data.mois_cloture == 5) {
          this.moisClotureArray = ['06', '09', '12', '03'];
        } else if (data.mois_cloture == 6 || data.mois_cloture == 7 || data.mois_cloture == 8) {
          this.moisClotureArray = ['09', '12', '03', '06'];
        } else if (data.mois_cloture == 9 || data.mois_cloture == 10 || data.mois_cloture == 11) {
          this.moisClotureArray = ['12', '03', '06', '09'];
        }

        if (this.forme_societe.startsWith("ASS")){
          this.PA_affectation = this.choixAffectation[0];
          this.valeurAffectation = data.resEx;
        } else if (this.forme_societe == "SCI" && this.categorie_revenu == "rfonc") {
          this.PA_affectation = this.choixAffectation[2];
          if (data.resEx > 0) {
            this.valeurAffectation = data.resEx;
          } else {
            this.valeurReportNouveau = data.resEx;
          }
        } else {
          this.PA_affectation = this.choixAffectation[1];
          this.valeurAffectation = this.montantDividendesN1;
          if (data.resEx > 0) {
            if (this.montantReserveLegale == this.capitalSocial * 0.1) {
              this.valeurReserveLegale = 0;
              this.valeurReserveOrdinaire = data.resEx;
            } else if (this.montantReserveLegale < this.capitalSocial * 0.1 && this.capitalSocial * 0.1 - this.montantReserveLegale - data.resEx <= 0) {
              this.valeurReserveLegale = this.capitalSocial * 0.1 - this.montantReserveLegale;
              this.valeurReserveOrdinaire = data.resEx - this.valeurReserveLegale;
            } else if (this.montantReserveLegale < this.capitalSocial * 0.1 && this.capitalSocial * 0.1 - this.montantReserveLegale - data.resEx > 0) {
              this.valeurReserveLegale = data.resEx;
              this.valeurReserveOrdinaire = 0;
            }
          } else if (data.resEx < 0) {
            if (data.resEx + this.montantReserveOrdinaire >= 0) {
              this.valeurReserveOrdinaire -= data.resEx;
            } else {
              this.valeurReportNouveau = data.resEx + this.montantReserveOrdinaire;
            }
          }
        };

        if (data.resEx < 0) {
          this.phraseAcomptes = 'Compte tenu du déficit constaté, aucun acompte d\'impôt sur les sociétés n\'est exigible au titre de l\'exercice à venir.'
        } else if (data.resEx >= 0 && this.infoImpotSociete.IS_tot <= 3000) {
          this.phraseAcomptes = 'Le montant total de l\'impot sur les sociétés dû au titre de cet exercice étant inférieur à 3000 €, aucun acompte n\'est exigible pour l\'exercice suivant.'
        }

        this.form.patchValue({
          CC: {
            comPerspective: data.anaSectorielle.commentaire
          },
          I: {
            masquerSection: data.I_classe2,
            prevAmoN: Math.round(this.dotations[0]),
            prevAmoN1: Math.round(this.dotations[1]),
            prevAmoN2: Math.round(this.dotations[2])
          },
          IS: {
            phraseAcomptes: this.phraseAcomptes
          },
          AI: {
            acompte1: Math.round(data.acompte_total/4),
            acompte2: Math.round(data.acompte_total/4),
            acompte3: Math.round(data.acompte_total/4),
            acompte4: Math.round(data.acompte_total/4)            
          },
          PA: {
            resEx: Math.round(data.resEx),
            resLeg: Math.round(this.valeurReserveLegale),
            resOrd: Math.round(this.valeurReserveOrdinaire),
            report: Math.round(this.valeurReportNouveau),
            affectation: this.PA_affectation,
            affect: Math.round(this.valeurAffectation)
          },
          AF: {
            enabled: data.tabAutofinancement
          },
          EA: {
            resEx: Math.round(data.resEx),
            dot: Math.round(this.dotations[1])
          },
          MD: {
            enabled: data.MD_salaries
          },
          S: {
            nomExpert: `${this.signataire.nomExpert} ${this.signataire.prenomExpert}`,
            qualiteExpert: 'Expert-Comptable',
            nomReviseur: `${this.signataire.nomReviseur} ${this.signataire.prenomReviseur}`,
            qualiteReviseur: 'Chef de groupe'
          }
        });
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
        this.loading = false;
      }
    })
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      // ===== CHIFFRES CLÉS =====
      CC: this.fb.group({
        comPerspective: [''],
        progressionChiffre: this.fb.group({
          commentaire: ['test commentaire']
        }),
        tauxMarge: this.fb.group({
          commentaire: ['']
        })
      }),

      // ===== ÉVOLUTION CHARGES EXTERNES & AUTRES ACHATS =====
      EC: this.fb.group({
        masquerSection: [false],
        montantVariationMin: [0.00],
        montantVariationMinPourcentage: [0.00],
        montantMinAffiché: [0.00],
        commentaire: ['']
      }),

      // ===== CHARGES DE PERSONNEL =====
      CP: this.fb.group({
        heuresRemunN: [0.00],
        heuresRemunN1: [0.00],
        annexeCotisationsEnabled: [false]
      }),

      // ===== INVESTISSEMENTS =====
      I: this.fb.group({
        masquerSection: [false],
        commentaire: [''],
        prevAmoN: [0.00],
        prevAmoN1: [0.00],
        prevAmoN2: [0.00]
      }),

      // ===== IMPÔT SUR LES SOCIÉTÉS =====
      IS: this.fb.group({
        masquerSection: [false],
        acomptes: [0.00],
        montant: [0.00],
        choixMontant: [''],
        phraseAcomptes: ['']
      }),

      // ===== ACOMPTES IMPÔT SUR LES SOCIÉTÉS N+1 =====
      AI: this.fb.group({
        masquerSection: [false],
        acompte1: [0.00],
        acompte2: [0.00],
        acompte3: [0.00],
        acompte4: [0.00]
      }),

      // ===== INFORMATION FISCALE =====
      IF: this.fb.array(
        this.informations_fiscales.map(() => this.fb.control(false))
      ),

      // ===== PROJET D’AFFECTATION DU RÉSULTAT =====
      PA: this.fb.group({
        resEx: [0.00],
        resLeg: [0.00],
        resOrd: [0.00],
        report: [0.00],
        affectation: [''],
        affect: [0.00]
      }),

      // ===== TABLEAU D’AUTOFINANCEMENT =====
      AF: this.fb.group({
        enabled: [true]
      }),

      // ===== ESTIMATION D’AUTOFINANCEMENT SUR LA BASE D'UNE HYPOTHESE DE MAINTIEN DU RÉSULTAT ACTUEL =====
      EA: this.fb.group({
        enabled: [false],
        resEx: [0.00],
        dot: [0.00],
        rembours: [0.00],
        divi: [0.00],
        capa: [0.00]
      }),

      // ===== MISE A JOUR DU DOCUMENT UNIQUE D’EVALUATION DES RISQUES PROFESSIONNELS DE L’ENTREPRISE =====
      MD: this.fb.group({
        enabled: [false]
      }),

      // ===== FAITS MARQUANTS DE L'EXERCICE =====
      FM: this.fb.group({
        enabled: [false],
        commentaire: [''],
        commentairesRevision: [false],
        justificationsDemandes: [false]
      }),

      // ===== LES PERSPECTIVES =====
      P: this.fb.group({
        commentaire: ['']
      }),

      // ===== SIGNATAIRE =====
      S: this.fb.group({
        nomExpert: [this.signataire?.nomExpert],
        qualiteExpert: ['Expert-Comptable'],
        nomReviseur: [this.signataire?.nomReviseur],
        qualiteReviseur: ['Chef de groupe']
      })
    });
  }

  get f() { return this.form.controls as any; }
  get IF(): FormArray { return this.form.get('IF') as FormArray; }

  private loadEvoChargesWithComments(evoCharges: any[]) {
    const requests = evoCharges.map(ligne =>
      this.pdfService.getComments(ligne.EC_numCompte).pipe(
        map(comment => ({ ...ligne, EC_comment: comment })),
        catchError(() => of({ ...ligne, EC_comment: null }))
      )
    );
    
    forkJoin(requests).subscribe(result => {
      this.infoEvolutionCharges = result;
    });
  }

  private formatPayload(obj: any, parentKey?: string): any {
    const formatNumber = (val: any, key?: string) => {
      if (typeof val !== 'number' || isNaN(val)) return val;

      // Si c’est un pourcentage
      if (key && key.includes('%')) {
        if (val < -100 || val > 100) {
          return 'NS';
        }
        return Number(val.toFixed(2)).toLocaleString('fr-FR');
      }

      // Sinon, arrondi normal
      return Math.round(val).toLocaleString('fr-FR');
    };

    if (Array.isArray(obj)) {
      return obj.map((item) => this.formatPayload(item, parentKey));
    } else if (typeof obj === 'object' && obj !== null) {
      return Object.keys(obj).reduce((acc, key) => {
        acc[key] = this.formatPayload(obj[key], key);
        return acc;
      }, {} as any);
    } else {
      return formatNumber(obj, parentKey);
    }
  }

  private formatEvoCharges(obj: any[], form: any) {
    return obj.filter(ligne => {
      const displayPrcVar =
        form['EC']['montantVariationMinPourcentage'] === 0 ||
        (ligne['EC_%Var'] &&
          Math.abs(ligne['EC_%Var']) >= form['EC']['montantVariationMinPourcentage']);

      return (
        ligne['EC_valN'] >= form['EC']['montantMinAffiché'] &&
        Math.abs(ligne['EC_valVar']) >= form['EC']['montantVariationMin'] &&
        displayPrcVar
      );
    });
  }


  onSubmit() {
    this.form.patchValue({
      EA: {
        capa: this.form.value.EA.resEx + this.form.value.EA.dot - this.form.value.EA.rembours - this.form.value.EA.divi
      }
    });

    const formData = this.form.value;

    this.infoChargesPersonnel.CP_heureVar = formData.CP.heuresRemunN - formData.CP.heuresRemunN1;
    this.infoChargesPersonnel["CP_%heureVar"] = this.infoChargesPersonnel.CP_heuresRemunN - this.infoChargesPersonnel.CP_heuresRemunN1 < 0 ? (-1 + (this.infoChargesPersonnel.CP_heuresRemunN / this.infoChargesPersonnel.CP_heuresRemunN1)) * 100 : (1 - this.infoChargesPersonnel.CP_heuresRemunNN / this.infoChargesPersonnel.CP_heuresRemunN1) * 100;
    this.infoChargesPersonnel.CP_coutHorN = this.infoChargesPersonnel.CP_N / formData.CP.heuresRemunN;
    this.infoChargesPersonnel.CP_coutHorN1 = this.infoChargesPersonnel.CP_N1 / formData.CP.heuresRemunN1;
    this.infoChargesPersonnel.CP_N = this.infoChargesPersonnel.CP_N;
    this.infoChargesPersonnel.CP_N1 = this.infoChargesPersonnel.CP_N1;

    this.infoImpotSociete.IS_montant = this.infoImpotSociete.IS_tot - this.infoImpotSociete.IS_credit - formData.IS.acomptes; 
    if (this.infoImpotSociete.IS_montant > 0) {
      formData.IS.choixMontant = "payer";
    } else if (this.infoImpotSociete.IS_montant < 0) {
      formData.IS.choixMontant = "rembourser";
    }

    const infoArray: boolean[] = formData.IF;

    const hasAny = infoArray.some(v => v === true);

    const infoFlags = this.informations_fiscales.reduce((acc, label, idx) => {
      const key = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      acc[key] = infoArray[idx];
      return acc;
    }, {} as Record<string, boolean>);

    const evoChargesApresAffichage = this.formatEvoCharges(this.infoEvolutionCharges, formData);


    const payload = {
      ...formData,
      informationFiscaleArray: infoArray,
      informationFiscale: infoFlags,
      informationFiscale_hasAny: hasAny,
      anneeN1Existe: this.anneeN1Existe,
      ...this.infoClient,
      ...this.infoChiffresCles,
      ...this.infoChargesPersonnel,
      ...this.infoImpotSociete,
      ...this.infoAutofinancement,
      EC_tab: evoChargesApresAffichage
    };

    const formattedPayload = this.formatPayload(payload);
    console.log(formattedPayload);

    this.wordService.generateWord(formattedPayload).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'LFM_test.docx'; 
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
