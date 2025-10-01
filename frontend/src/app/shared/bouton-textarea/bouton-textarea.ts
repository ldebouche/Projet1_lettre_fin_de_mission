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

    if (caN < t1) return "tranche 1";
    if (caN < t2) return "tranche 2";
    if (caN < t3) return "tranche 3";
    if (caN < t4) return "tranche 4";
    return "tranche 5";
  }

  checkFDC(variation: number): string {
    if (variation > 0) {
      return "acquisition de fond de commerce";
    } else if (variation < 0) {
      return "cession de fond de commerce ou de branche d'activité";
    } else {
      return "";
    }
  }

  onGenerateComment() {
    this.loading = true;
    switch (this.categorie) {
      case 'CA_marge':
        let caSecteur = this.anaSectorielle.find((a: any) => a.libelle === 'Chiffre d’affaires HT en €').tranches;
        let margeSecteur = this.anaSectorielle.find((a: any) => a.libelle === 'Marge brute globale').tranches;
        this.callAI(
          'CA_marge',
          {
            anneeN: this.data.anneeN,
            anneeN1: this.data.anneeN1,
            millesimeSecteur: this.anaSectorielle[0]?.millesime ?? null,
            maTranche: this.getTrancheCA(this.data.caN, caSecteur),
            'CA': {
              caN: Math.round(this.data.caN).toLocaleString('fr-FR'),
              caN1: Math.round(this.data.caN1).toLocaleString('fr-FR'),
              variationCA: Math.round(this.data.caVar).toLocaleString('fr-FR'),
              variationPrcCA: this.data["%caVar"].toFixed(2),
              caSecteur: caSecteur,
              FDC: this.checkFDC(this.data.compte207Var),
            },
            'MARGE': {
              margeN: Math.round(this.data.margeN).toLocaleString('fr-FR'),
              margeN1: Math.round(this.data.margeN1).toLocaleString('fr-FR'),
              margeNPrcCA: this.data["%margeN"].toFixed(2),
              margeN1PrcCA: this.data["%margeN1"].toFixed(2),
              variationMarge: Math.round(this.data.margeVar).toLocaleString('fr-FR'),
              variationPrcMarge: this.data["%margeVar"].toFixed(2),
              margeSecteur: margeSecteur,
            },
            produitsFinanciers: this.data.produitsFinanciers,
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
