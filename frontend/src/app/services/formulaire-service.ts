import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class FormulaireService {
  constructor(private fb: FormBuilder) {}

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

  buildForm(): FormGroup {
    return this.fb.group({
      // ===== CHIFFRES CLÉS =====
      CC: this.fb.group({
        comPerspective: [''],
        commentaire: ['']
      }),

      // ===== ÉVOLUTION CHARGES EXTERNES & AUTRES ACHATS =====
      EC: this.fb.group({
        masquerSection: [false],
        montantVariationMin: [0],
        montantVariationMinPourcentage: [0],
        montantMinAffiché: [0],
        commentaire: ['']
      }),

      // ===== CHARGES DE PERSONNEL =====
      CP: this.fb.group({
        heuresRemunN: [0],
        heuresRemunN1: [0],
        annexe1TNS: [],
        annexe2TNS: []
      }),

      // ===== INVESTISSEMENTS =====
      I: this.fb.group({
        masquerSection: [false],
        commentaire: [''],
        prevAmoN: [0],
        prevAmoN1: [0],
        prevAmoN2: [0]
      }),

      // ===== IMPÔT SUR LES SOCIÉTÉS =====
      IS: this.fb.group({
        masquerSection: [false],
        acomptes: [0],
        choixMontant: [''],
        phraseAcomptes: ['']
      }),

      // ===== ACOMPTES N+1 =====
      AI: this.fb.group({
        masquerSection: [false],
        acompte1: [0],
        acompte2: [0],
        acompte3: [0],
        acompte4: [0]
      }),

      // ===== INFORMATION FISCALE =====
      IF: this.fb.array(
        this.informations_fiscales.map(() => this.fb.control(false))
      ),

      // ===== PROJET D’AFFECTATION DU RÉSULTAT =====
      PA: this.fb.group({
        resEx: [0],
        resLeg: [0],
        resOrd: [0],
        report: [0],
        affectation: [''],
        affect: [0]
      }),

      // ===== TABLEAU D’AUTOFINANCEMENT =====
      AF: this.fb.group({
        enabled: [true]
      }),

      // ===== FISCALITE =====
      T: this.fb.group({
        enabled: [false],
        emprunts: [],
        commentaire: ['']
      }),

      // ===== ESTIMATION D’AUTOFINANCEMENT =====
      EA: this.fb.group({
        enabled: [false],
        resEx: [0],
        dot: [0],
        rembours: [0],
        divi: [0],
        capa: [0]
      }),

      // ===== MAJ DU DOCUMENT UNIQUE =====
      MD: this.fb.group({
        enabled: [false]
      }),

      // ===== FAITS MARQUANTS =====
      FM: this.fb.group({
        enabled: [false],
        commentaire: [''],
        justificationsDemandes: [false]
      }),

      // ===== LES PERSPECTIVES =====
      P: this.fb.group({
        commentaire: ['']
      }),

      // ===== POINTS IMPORTANTS =====
      PI: this.fb.group({
        commentaire: ['']
      }),

      // ===== SIGNATAIRE =====
      S: this.fb.group({
        nomExpert: [''],
        qualiteExpert: ['Expert-Comptable'],
        nomReviseur: [''],
        qualiteReviseur: ['Chef de groupe']
      })
    });
  }
}
