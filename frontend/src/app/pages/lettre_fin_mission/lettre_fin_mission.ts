import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { filter, forkJoin, interval, switchMap, take } from 'rxjs';

import { DbService } from '../../services/db-service';
import { WordService } from '../../services/word-service';
import { PdfService } from '../../services/pdf-service';
import { FormulaireService } from '../../services/formulaire-service';
import { FiscaliteService } from '../../services/fiscalite-service';
import { ChargesService } from '../../services/charges-service';
import { FormatService } from '../../services/format-service';
import { SectionsModule } from './sections/sections-module';
import { DataService } from '../../services/data-service';
import { ModalComponent } from '../../shared/modal/modal';

@Component({
  selector: 'app-lettre-fin-mission',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SectionsModule,
    ModalComponent
  ],
  templateUrl: './lettre_fin_mission.html',
  styleUrls: ['./lettre_fin_mission.scss']
})
export class LettreFinMissionComponent implements OnInit {
  form!: FormGroup;
  loading = true;
  generationDone = false;
  generatedPath: string = '';
  pptGenerating = false;
  codeClient: any | null;
  dateDebutEx: string | null;
  dateFinEx: any | null;
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

  infoChargesPersonnel: any = {};
  infoImpotSociete: any = {};
  infoClient: any = {};
  infoChiffresCles: any = {};
  infoAutofinancement: any = {};
  infoEvolutionCharges: any = {};
  allEvolutionCharges: any[] = [];
  informations_fiscales!: string[];
  infoSeuilRenta: any = {};
  infoRatioExploitation: any = {};

  dataCA = {};
  dataMarge = {};

  dotations = [];
  immobs: any;
  anaSectorielle: any;
  pointsImportants: any;
  emprunts: any;
  empruntsPath: any;

  data: any;
  modeLFM: string | null = null;

  autofinancement = false;
  cotisationTravIndep = false;
  isAssoc = false;
  isBnc = false;
  isSciIr = false;
  isSciIs = false;
  isEi = false;

  constructor(
    private pdfService: PdfService,
    private formService: FormulaireService,
    private fiscaliteService: FiscaliteService,
    private chargesService: ChargesService,
    private formatService: FormatService,
    private db: DbService,
    private wordService: WordService,
    private dataService: DataService,
    private router: Router
  ) {
    this.informations_fiscales = this.formService.informations_fiscales;
    this.dateDebutEx = this.dataService.getDateDebutEx();
    this.codeClient = this.dataService.getCodeClient();
    this.dateFinEx = this.dataService.getDateFinEx();
  }



  ngOnInit(): void {
    this.form = this.formService.buildForm();
    this.modeLFM = this.dataService.getModeLFM();

    forkJoin({
      data: this.db.GetDossierInfos(),
      dotations: this.pdfService.getDotations(this.codeClient, this.dateFinEx),
      immobs: this.pdfService.getImmob(this.codeClient, this.dateFinEx),
      pointsImportants: this.pdfService.getPointsImportants(this.codeClient, this.dateFinEx),
      empruntsData: this.pdfService.getEmprunts(this.codeClient, this.dateFinEx)
    }).subscribe({
      next: ({ data, dotations, immobs, pointsImportants, empruntsData }: any) => {
        const { emprunts, empruntsPath } = empruntsData || {};
        console.log(data);
        console.log(dotations);
        console.log(emprunts);
        console.log(data.anaSectorielle);
        console.log(immobs);
        this.data = data;
        if (dotations) {
          this.dotations = Object.values(dotations);
        }

        if (immobs) {
          this.immobs = immobs;
        }

        if (pointsImportants) {
          this.pointsImportants = this.formatService.formatPointsImportants(pointsImportants);
        }

        if (data.anaSectorielle) {
          this.anaSectorielle = data.anaSectorielle;
        }

        if (emprunts.emprunts.length) {
          this.emprunts = this.formatService.formatEmprunts(emprunts, this.dateDebutEx, data.chiffreCles.dateFinEx);
          this.empruntsPath = empruntsPath;
        }

        this.infoChargesPersonnel = data.chargesPersonnel;
        this.infoImpotSociete = data.impotSociete;
        this.infoClient = data.client;
        this.infoChiffresCles = data.chiffreCles;
        this.infoAutofinancement = data.autofinancement;
        this.autofinancement = data.tabAutofinancement;
        this.infoSeuilRenta = {
          seuilRenta: data.seuilRentaFinan,
          rentaJours: data.seuilRentaFinan / data.chiffreCles.CC_caN * 360
        };
        this.infoRatioExploitation = data.ratiosExploitation;

        this.anneeN = data.anneeN;
        this.anneeN1Existe = data.anneeN1Existe;
        this.resEx = data.resEx;
        this.I_classe2 = data.I_classe2;
        this.IS_tot = data.IS_tot;
        this.MD_salaries = data.MD_salaries;
        this.imposable = data.imposable;
        this.forme_societe = data.client.forme_societe;
        this.categorie_revenu = data.categorie_revenu;
        this.isAssoc = data.client.isAssoc;
        this.isSciIr = data.client.isSciIr;
        this.isSciIs = data.client.isSciIs;
        this.isBnc = data.client.isBnc;
        this.isEi = data.client.isEi;
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

        const comPerspective = this.formatService.texteRefactor(data.anaSectorielle.commentaire);

        this.moisClotureArray = this.fiscaliteService.getMoisClotureArray(data.mois_cloture);

        const affectation = this.fiscaliteService.calculAffectation(
          data,
          data.capitalSocial ?? 0,
          data.montantDividendesN1 ?? 0
        );

        const phraseAcomptes = this.fiscaliteService.getPhraseAcomptes(data.resEx, data.impotSociete.IS_tot);
        const acomptes = data.impotSociete.IS_acomptes;

        this.cotisationTravIndep = data.cotisationTravIndep;

        this.chargesService.loadEvoChargesWithComments(data.evolutionCharges, this.codeClient, this.dateFinEx).subscribe({
          next: (res) => {
            this.allEvolutionCharges = res ?? [];
            this.infoEvolutionCharges = this.chargesService.formatEvoCharges(this.allEvolutionCharges, this.form.value);
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
          CI: {
            masquerSection: data.cotisationTravIndep,
          },
          I: {
            prevAmoN: this.dotations[0] ? Math.round(this.dotations[0]) : null,
            prevAmoN1: this.dotations[1] ? Math.round(this.dotations[1]) : null,
            prevAmoN2: this.dotations[2] ? Math.round(this.dotations[2]) : null
          },
          IS: {
            acomptes,
            choixMontant: this.infoImpotSociete.IS_tot - this.infoImpotSociete.IS_credit - acomptes < 0 ? "rembourser" : "payer",
            phraseAcomptes,
            IS_montant: Math.round(this.infoImpotSociete.IS_tot - this.infoImpotSociete.IS_credit - acomptes)
          },
          AI: {
            masquerSection: data.imposable && this.resEx > 0 && this.IS_tot > 3000 ? false : true,
            acompte1: Math.round(data.acompte_total / 4),
            acompte2: Math.round(data.acompte_total / 4),
            acompte3: Math.round(data.acompte_total / 4),
            acompte4: Math.round(data.acompte_total / 4),
            date1: this.moisClotureArray[0],
            date2: this.moisClotureArray[1],
            date3: this.moisClotureArray[2],
            date4: this.moisClotureArray[3],
            date5: this.moisClotureArray[4]
          },
          PA: {
            resEx: Math.round(this.resEx),
            resLeg: Math.round(affectation.resLeg),
            resOrd: Math.round(affectation.resOrd),
            report: Math.round(affectation.report),
            affectation: affectation.affectation,
            affect: Math.round(affectation.affect)
          },
          AF: {
            enabled: this.autofinancement,
            resEx: Math.round(data.autofinancement.AF_resEx),
            dota: Math.round(data.autofinancement.AF_dota),
            reprises: Math.round(data.autofinancement.AF_reprises),
            cessions: Math.round(data.autofinancement.AF_cessions),
            subv: Math.round(data.autofinancement.AF_subv),
            rembours: Math.round(data.autofinancement.AF_rembours),
            divi: Math.round(data.autofinancement.AF_divi)
          },
          T: {
            tresoN1: Math.round(data.tresorerie?.tresoN1 || 0),
            CAF: Math.round(data.autofinancement?.AF_capa || 0),
            RF_apport: Math.round(data.tresorerie?.RF_apport || 0),
            RF_emprunts: Math.round(data.tresorerie?.RF_emprunts || 0),
            RF_invest: Math.round(data.tresorerie?.RF_invest || 0),
            RF_autre: Math.round(data.tresorerie?.RF_autre || 0),
            EF_invest: Math.round(data.tresorerie?.EF_invest || 0),
            EF_emprunts: Math.round(data.tresorerie?.EF_emprunts || 0),
            EF_retraits: Math.round(data.tresorerie?.EF_retraits || 0),
            EF_divi: Math.round(data.tresorerie?.EF_divi || 0),
            V_stock: Math.round(data.tresorerie?.V_stock || 0),
            V_creances: Math.round(data.tresorerie?.V_creances || 0),
            V_dettes: Math.round(data.tresorerie?.V_dettes || 0),
            V_autresCreances: Math.round(data.tresorerie?.V_autresCreances || 0),
            V_autresDettes: Math.round(data.tresorerie?.V_autresDettes || 0),
            tresoN: Math.round(data.tresorerie?.tresoN || 0),
            frng: Math.round((data.autofinancement?.AF_capa || 0) + (data.tresorerie?.RF_apport || 0) + (data.tresorerie?.RF_emprunts || 0) + (data.tresorerie?.RF_invest || 0) + (data.tresorerie?.RF_autre || 0) + (data.tresorerie?.EF_invest || 0) + (data.tresorerie?.EF_emprunts || 0) + (data.tresorerie?.EF_retraits || 0) + (data.tresorerie?.EF_divi || 0)),
            bfr: Math.round((data.tresorerie?.V_stock || 0) + (data.tresorerie?.V_creances || 0) + (data.tresorerie?.V_dettes || 0) + (data.tresorerie?.V_autresCreances || 0) + (data.tresorerie?.V_autresDettes || 0)),
            emprunts: this.emprunts
          },
          E: {
            emprunts: this.emprunts
          },
          EA: {
            resEx: Math.round(this.resEx),
            dot: this.dotations[1] ? Math.round(this.dotations[1]) : 0,
            rembours: emprunts?.totalRemboursN1 ? Math.round(emprunts?.totalRemboursN1) : 0,
          },
          MD: {
            enabled: data.MD_salaries
          },
          PI: {
            commentaire: this.pointsImportants
          },
          S: {
            nomExpert: `${data.signataire.nomExpert} ${data.signataire.prenomExpert}`,
            nomReviseur: `${data.signataire.nomReviseur} ${data.signataire.prenomReviseur}`,
          }
        });

        // Écouter les changements du formulaire AF pour mettre à jour la CAF dans le formulaire T
        this.form.get('AF')?.valueChanges.subscribe(afValues => {
          if (afValues && afValues.capaAutof !== undefined) {
            this.form.get('T')?.patchValue({
              CAF: afValues.capaAutof
            });
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
    let choix1PremierParagraphe = parseFloat(this.infoChiffresCles.CC_resNetN) >= 0 ? "bénéfice" : "déficit";
    let choix2PremierParagraphe = parseFloat(this.infoChiffresCles.CC_resNetN1) >= 0 ? "bénéfice" : "déficit";
    if (this.isAssoc || this.isBnc) {
      choix1PremierParagraphe = parseFloat(this.infoChiffresCles.CC_resNetN) >= 0 ? "excédent" : "insuffisance";
      choix2PremierParagraphe = parseFloat(this.infoChiffresCles.CC_resNetN1) >= 0 ? "excédent" : "insuffisance";
    }
    const EA = this.form.value.EA;
    const PA = this.form.value.PA;
    const AF = this.form.value.AF;
    const T = this.form.value.T; // Récupérer les valeurs actuelles de trésorerie

    const evoChargesForPayload = this.chargesService.formatEvoCharges(this.allEvolutionCharges ?? [], this.form.value);
    this.infoEvolutionCharges = evoChargesForPayload;

    this.form.patchValue({
      PA: {
        graphCapSoc: this.data.capitalSocial,
        graphPrimeCapSoc: this.data.primeCapSoc,
        graphResLeg: this.data.montantReserveLegale + PA.resLeg,
        graphResOrd: this.data.montantReserveOrdinaire + PA.resOrd,
        graphReport: this.data.montantReportNouveau + PA.report,
        graphCapitauxPropres: this.data.capitalSocial + this.data.primeCapSoc + this.data.montantReserveLegale + PA.resLeg + this.data.montantReserveOrdinaire + PA.resOrd + this.data.montantReportNouveau + PA.report
      },
      EA: {
        capa: EA.resEx + EA.dot - EA.rembours - EA.divi
      },
      T: {
        tresoN1: T.tresoN1,
        CAF: Math.round(AF.capaAutof),
        RF_apport: T.RF_apport,
        RF_emprunts: T.RF_emprunts,
        RF_invest: T.RF_invest,
        RF_autre: T.RF_autre,
        EF_invest: T.EF_invest,
        EF_emprunts: T.EF_emprunts,
        EF_retraits: T.EF_retraits,
        EF_divi: T.EF_divi,
        V_stock: T.V_stock,
        V_creances: T.V_creances,
        V_dettes: T.V_dettes,
        V_autresCreances: T.V_autresCreances,
        V_autresDettes: T.V_autresDettes,
        tresoN: T.tresoN,
        frng: Math.round(AF.capaAutof + T.RF_apport + T.RF_emprunts + T.RF_invest + T.RF_autre + T.EF_invest + T.EF_emprunts + T.EF_retraits + T.EF_divi),
        bfr: Math.round(T.V_stock + T.V_creances + T.V_dettes + T.V_autresCreances + T.V_autresDettes),
        emprunts: this.emprunts
      },
      FM: {
        enabled: !!(this.form.value.FM.commentaire || this.form.value.FM.justificationsDemandes)
      }
    });

    const formData = this.form.value;

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
      // Utiliser les valeurs calculées du formulaire au lieu des valeurs initiales de la BDD
      autofinancement: {
        AF_resEx: AF.resEx,
        AF_dota: AF.dota,
        AF_reprises: AF.reprises,
        AF_cessions: AF.cessions,
        AF_subv: AF.subs,
        AF_capa: AF.capaAutof,
        AF_rembours: AF.rembours,
        AF_divi: AF.divi,
        AF_capaNet: AF.capaAutofNet
      },
      AS: this.anaSectorielle,
      SR: this.infoSeuilRenta,
      EC_tab: evoChargesForPayload,
      RE: this.infoRatioExploitation,
      empruntsPath: this.empruntsPath,
      choix1PremierParagraphe,
      choix2PremierParagraphe
    };

    const formattedPayload = this.formatService.formatPayload(payload);
    console.log(formattedPayload);

    const condition = this.wordService.checkConditions(this.form, this.imposable || this.isEi);
    if (condition) {
      alert(condition);
      return;
    }

    const code_client = this.infoClient.code_client

    const folderPath = `C:\\outils-avenia\\${code_client}\\LFM\\${formattedPayload.anneeN}\\RESTITUTION`;
    this.wordService.generateWord(formattedPayload, folderPath, this.modeLFM).subscribe({
      next: (res) => {
        const jobId = res.jobId;

        this.pptGenerating = !!jobId;

        if (!jobId) {
          this.generatedPath = res.folder;
          this.generationDone = true;
          return;
        }

        interval(2000).pipe(
          switchMap(() => this.wordService.getJobStatus(jobId)),
          filter(r => r.status === 'done' || r.status === 'error'),
          take(1)
        ).subscribe({
          next: (status) => {
            if (status.status === 'done') {
              this.generatedPath = res.folder;
              this.generationDone = true;
              this.pptGenerating = false;
            } else {
              alert("Erreur lors de la génération du PowerPoint.");
            }
          }
        });
      },
      error: () => alert("Erreur : Fichier word déjà ouvert.")
    });
  }

  closeMessage() {
    this.generationDone = false;
    this.router.navigate(['/dashboard']);
  }
}
