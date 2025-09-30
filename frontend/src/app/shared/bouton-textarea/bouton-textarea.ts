import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

import { AiService } from '../../services/ai-service';
import { PdfService } from '../../services/pdf-service';

@Component({
  selector: 'bouton-textarea',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bouton-textarea.html',
  styleUrls: ['./bouton-textarea.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => BtnToTextareaComponent),
    multi: true
  }]
})
export class BtnToTextareaComponent implements ControlValueAccessor {
  buttonLabel = 'Générer commentaire';
  /** Valeur initiale injectée au moment du clic si vide */
  @Input() defaultText = 'Texte par défaut (modifiable)…';
  @Input() selector = true; // true: commentaire, false: analyse
  @Input() categorie ='';
  @Input() data: any;
  @Input() anaSectorielle: any;

  value = '';
  disabled = false;
  private touched = false;

  loading = false;

  code_client = '';
  errorMessage = '';

  constructor(
    private ai: AiService, 
    private pdf: PdfService
  ) {}

  get showTextarea() { return (this.value ?? '').trim().length > 0; }

  // ControlValueAccessor
  onChange: (val: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(val: string | null): void {
    this.value = val ?? '';
  }
  registerOnChange(fn: (val: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

  handleClick() {
    if (this.disabled) return;
    if (!this.value) {
      if (this.selector) {
        this.onGenerateComment();
      }
      else {
        this.onGenerateAnalyse();
      }

      this.onChange(this.value);
      this.markTouched();
    }
  }

  getTrancheCA(caN: number, caSecteur: any): string {
    const parseNum = (val: string): number =>
      parseFloat(val.replace(/\s/g, "").replace(",", "."));
  
    const t1 = parseNum(caSecteur.tranche_1);
    const t2 = parseNum(caSecteur.tranche_2);
    const t3 = parseNum(caSecteur.tranche_3);
    const t4 = parseNum(caSecteur.tranche_4);
    const t5 = parseNum(caSecteur.tranche_5);

    if (caN < t1) return "tranche 1";
    if (caN < t2) return "tranche 2";
    if (caN < t3) return "tranche 3";
    if (caN < t4) return "tranche 4";
    if (caN < t5) return "tranche 5";
    return " supérieure à la tranche 5";
  }

  onGenerateComment() {
    this.loading = true;
    switch (this.categorie) {
      case 'CA':
        let caSecteur = this.anaSectorielle.find((a: any) => a.libelle === 'Chiffre d’affaires HT en €').tranches;

        this.callAI(
          'CA',
          {
            anneeN: this.data.anneeN,
            anneeN1: this.data.anneeN1,
            caN: this.data.caN.toLocaleString('fr-FR'),
            caN1: this.data.caN1.toLocaleString('fr-FR'),
            variationCA: this.data.caVar.toLocaleString('fr-FR'),
            variationPrcCA: this.data["%caVar"].toFixed(2),
            millesimeSecteur: this.anaSectorielle[0]?.millesime ?? null,
            caSecteur: caSecteur,
            maTranche: this.getTrancheCA(this.data.caN, caSecteur),

            //grosse_variation
            produitsFinanciers: this.data.produitsFinanciers,
            compte207_credit: this.data.compte207_credit,
            compte207_debit: this.data.compte207_debit,
          }
        );
        break;

      case 'marge':
        this.callAI(
          'marge',
          {
            anneeN: this.data.anneeN,
            anneeN1: this.data.anneeN1,
            margeN: this.data.margeN,
            margeN1: this.data.margeN1,
            anaFinanciere: this.anaSectorielle
          }
        );
        break;

      case 'investissement':
        this.pdf.getImmob().subscribe({
          next: (data: any) => {
            this.callAI(
              'investissement',
              {
                total_entrees: data.immobEntree.totalGeneral,
                entrees: data.immobEntree.comptes,
                total_sorties: data.immobSortie.totalGeneral,
                sorties: data.immobSortie.comptes,
              }
            );
          },
          error: () => this.setError()
        });
        break;
      default:
        this.loading = false;
        this.errorMessage = 'Catégorie non reconnue';
    }
  }

  private callAI(type: string, contexte: any) {
    this.ai.generateComment(type, contexte).subscribe({
      next: (text) => this.setResult(text),
      error: () => this.setError()
    });
  }

  onGenerateAnalyse() {
    this.loading = true;

    this.ai.pipelineAnalyse(
      {
        secteur: "BTP",
        periode: { from: "2023", to: "2024" },
        donneesInternes: {
          clientNom: "Entreprise ACME",
          siren: "123456789",
          ca: 420000,
          marge: 0.18
        },
        redactCloud: true
      }
    ).subscribe({
      next: (text) => {
        this.value = text && text.trim() ? text : this.defaultText;
        this.onChange(this.value);
        this.markTouched();
        this.loading = false;   
      }
    });
  }

  handleInput(val: string) {
    this.value = val;
    this.onChange(this.value);
  }

  handleBlur() {
    this.markTouched();
  }

  private markTouched() {
    if (!this.touched) {
      this.onTouched();
      this.touched = true;
    }
  }

  private setResult(text: string) {
    this.value = text && text.trim() ? text : this.defaultText;
    this.onChange(this.value);
    this.markTouched();
    this.loading = false;
  }

  private setError() {
    this.errorMessage = 'Erreur lors de la génération du texte';
    this.loading = false;
  }
}
