import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';

import { DbService } from '../../services/db-service';
import { WordService } from '../../services/word-service';
import { PdfService } from '../../services/pdf-service';
import { FormulaireService } from '../../services/formulaire-service';
import { FiscaliteService } from '../../services/fiscalite-service';
import { ChargesService } from '../../services/charges-service';
import { FormatService } from '../../services/format-service';
import { SectionsModule } from './sections/sections-module';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-formulaire',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SectionsModule
  ],
  templateUrl: './formulaire.html',
  styleUrls: ['./formulaire.scss']
})
export class FormulaireComponent implements OnInit {
  form!: FormGroup;
  loading = true;
  code_client = '';
  anneeN = 0;
  anneeN1Existe = true;
  I_classe2 = true;
  IS_tot = 0;
  MD_salaries = true;
  imposable = true;
  moisClotureArray = [''];
  resEx = 0;
  forme_societe = '';
  categorie_revenu = '';

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

  infoChargesPersonnel: any = {};
  infoImpotSociete: any = {};
  infoClient: any = {};
  infoChiffresCles: any = {};
  infoAutofinancement: any = {};
  infoEvolutionCharges: any = {};
  informations_fiscales!: string[];

  dataCA = {};
  dataMarge = {};
  anaSectorielle: any;
  
  constructor(
    private pdfService: PdfService,
    private formService: FormulaireService,
    private fiscaliteService: FiscaliteService,
    private chargesService: ChargesService,
    private formatService: FormatService,
    private db: DbService,
    private wordService: WordService,
    private dataService: DataService
  ) {
    this.informations_fiscales = this.formService.informations_fiscales;
    this.code_client = this.dataService.getCodeClient();
  }

  

  ngOnInit(): void {
    this.form = this.formService.buildForm();

    forkJoin({
      data: this.db.GetDossierInfos(),
      dotations: this.pdfService.getDotations(),
      //bilanSocial: this.pdfService.getBilanSocial()
    }).subscribe({
      next: ({ data, dotations }: any) => {
        console.log(data);
        this.dotations = Object.values(dotations);
        
        this.infoChargesPersonnel = data.chargesPersonnel;
        this.infoImpotSociete = data.impotSociete;
        this.infoClient = data.client;
        this.infoChiffresCles = data.chiffreCles;
        this.infoAutofinancement = data.autofinancement;

        this.anneeN = data.anneeN;
        this.anneeN1Existe = data.anneeN1Existe;
        this.resEx = data.resEx;
        this.I_classe2 = data.I_classe2;
        this.IS_tot = data.IS_tot;
        this.MD_salaries = data.MD_salaries;
        this.imposable = data.imposable;
        this.forme_societe = data.forme_societe;
        this.categorie_revenu = data.categorie_revenu;

        this.dataCA = {
          caN: data.chiffreCles.CC_caN,
          caN1: data.chiffreCles.CC_caN1,
          caVar: data.chiffreCles.CC_caVar,
          "%caVar": data.chiffreCles["CC_%caVar"],
          anneeN: data.anneeN,
          anneeN1: data.anneeN1,
          compte207Var: data.compte207Var,
          produitsFinanciers: data.produitsFinanciers,
          margeN: data.chiffreCles.CC_margeN,
          "%margeN": data.chiffreCles["CC_%margeN"],
          margeN1: data.chiffreCles.CC_margeN1,
          "%margeN1": data.chiffreCles["CC_%margeN1"],
          margeVar: data.chiffreCles.CC_margeVar,
          "%margeVar": data.chiffreCles["CC_%margeVar"],
        };

        this.anaSectorielle = [data.anaSectorielle.valeurs.find((a: any) => a.libelle === 'Chiffre d’affaires HT en €'),
          data.anaSectorielle.valeurs.find((a: any) => a.libelle === 'Marge brute globale')];
        console.log(this.anaSectorielle);
        const comPerspective = this.formatService.texteRefactor(data.anaSectorielle.commentaire);

        this.moisClotureArray = this.fiscaliteService.getMoisClotureArray(data.mois_cloture);

        const affectation = this.fiscaliteService.calculAffectation(
          data,
          data.capitalSocial ?? 0,
          data.montantDividendesN1 ?? 0
        );

        const phraseAcomptes = this.fiscaliteService.getPhraseAcomptes(data.resEx, data.IS_tot);

        this.chargesService.loadEvoChargesWithComments(data.evolutionCharges).subscribe({
          next: (res) => {
            this.infoEvolutionCharges = this.chargesService.formatEvoCharges(res, this.form.value);
            this.loading = false;
          },
          error: (err) => {
            console.error("Erreur lors du chargement des charges :", err);
            this.loading = false;
          }
        });

        this.form.patchValue({
          CC: {
            comPerspective
          },
          I: {
            masquerSection: data.I_classe2,
            prevAmoN: Math.round(this.dotations[0]),
            prevAmoN1: Math.round(this.dotations[1]),
            prevAmoN2: Math.round(this.dotations[2])
          },
          IS: {
            phraseAcomptes
          },
          AI: {
            acompte1: Math.round(data.acompte_total/4),
            acompte2: Math.round(data.acompte_total/4),
            acompte3: Math.round(data.acompte_total/4),
            acompte4: Math.round(data.acompte_total/4)            
          },
          PA: {
            resEx: Math.round(data.resEx),
            resLeg: Math.round(affectation.resLeg),
            resOrd: Math.round(affectation.resOrd),
            report: Math.round(affectation.report),
            affectation: affectation.affectation,
            affect: Math.round(affectation.affect)
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
            nomExpert: `${data.signataire.nomExpert} ${data.signataire.prenomExpert}`,
            nomReviseur: `${data.signataire.nomReviseur} ${data.signataire.prenomReviseur}`,
          }
        });
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
        this.loading = false;
      }
    })
  }

  get f() { return this.form.controls as any; }
  get IF(): FormArray { return this.form.get('IF') as FormArray; }

  onSubmit() {
    const EA = this.form.value.EA;

    this.form.patchValue({
      EA: {
        capa: EA.resEx + EA.dot - EA.rembours - EA.divi
      },
      FM: {
        enabled: !!(this.form.value.FM.commentaire || this.form.value.FM.justificationsDemandes)
      }
    });

    const formData = this.form.value;

    this.infoImpotSociete.IS_montant = this.infoImpotSociete.IS_tot - this.infoImpotSociete.IS_credit - formData.IS.acomptes; 
    if (this.infoImpotSociete.IS_montant > 0) {
      formData.IS.choixMontant = "payer";
    } else if (this.infoImpotSociete.IS_montant < 0) {
      formData.IS.choixMontant = "rembourser";
    }

    const infoArray: boolean[] = formData.IF;

    const infoFlags = this.informations_fiscales.reduce((acc, label, idx) => {
      const key = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      acc[key] = infoArray[idx];
      return acc;
    }, {} as Record<string, boolean>);

    const payload = {
      ...formData,
      informationFiscaleArray: infoArray,
      informationFiscale: infoFlags,
      informationFiscale_hasAny: infoArray.some(v => v === true),
      anneeN1Existe: this.anneeN1Existe,
      ...this.infoClient,
      ...this.infoChiffresCles,
      ...this.infoChargesPersonnel,
      ...this.infoImpotSociete,
      ...this.infoAutofinancement,
      AS: this.formatService.formatASData(this.anaSectorielle),
      EC_tab: this.infoEvolutionCharges
    };

    const formattedPayload = this.formatService.formatPayload(payload);
    console.log(formattedPayload);

    const folderPath = 'C:\\Users\\DEBOUCHELucas\\lfm\\word';
    this.wordService.generateWord(formattedPayload, folderPath).subscribe();
  }
}
