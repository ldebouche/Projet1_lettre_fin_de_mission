import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor, FormControl } from '@angular/forms';

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
  @Input() buttonLabel = 'Générer commentaire';
  @Input() defaultText = 'Texte par défaut (modifiable)…';
  @Input() categorie ='';
  @Input() data: any;
  @Input() anaSectorielle: any;

  @Output() tableauInvestissement = new EventEmitter<string>();

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

  handleClick(typeComment: string = '') {
    if (this.disabled) return;
    this.onGenerateComment(typeComment);
    this.onChange(this.value);
    this.markTouched();
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

  onGenerateComment(typeComment: string) {
    this.loading = true;
    switch (typeComment) {
      case 'CA_marge':
        let caSecteur = "";
        let margeSecteur = "";
        let millesimeSecteur = ""; 
        let maTranche = "";
        if (this.anaSectorielle) {
          caSecteur = this.anaSectorielle[3].tranches;
          margeSecteur = this.anaSectorielle[5].tranches;
          millesimeSecteur = this.anaSectorielle[0]?.millesime ?? null;
          maTranche = this.getTrancheCA(this.data.caN, this.anaSectorielle[0].tranches);
        }

        let caN1 = "";
        let variationCA = "";
        let variationPrcCA = "";

        let margeN1 = "";
        let margeN1PrcCA = "";
        let variationMarge = "";
        let variationPrcMarge = "";
        if (this.data.anneeN1) {
          caN1 = Math.round(this.data.caN1).toLocaleString('fr-FR');
          variationCA = Math.round(this.data.caVar).toLocaleString('fr-FR');
          variationPrcCA = this.data["%caVar"].toFixed(2);

          margeN1 = Math.round(this.data.margeN1).toLocaleString('fr-FR');
          margeN1PrcCA = this.data["%margeN1"].toFixed(2);
          variationMarge = Math.round(this.data.margeVar).toLocaleString('fr-FR');
          variationPrcMarge = this.data["%margeVar"].toFixed(2);
        }
        this.callAI(
          'CA_marge',
          {
            anneeN: this.data.anneeN,
            anneeN1: this.data.anneeN1,
            millesimeSecteur,
            maTranche,
            'CA': {
              caN: Math.round(this.data.caN).toLocaleString('fr-FR'),
              caN1,
              variationCA,
              variationPrcCA,
              caSecteur,
              FDC: this.checkFDC(this.data.compte207Var),
            },
            'MARGE': {
              margeN: Math.round(this.data.margeN).toLocaleString('fr-FR'),
              margeN1,
              margeNPrcCA: this.data["%margeN"].toFixed(2),
              margeN1PrcCA,
              variationMarge,
              variationPrcMarge,
              margeSecteur,
            },
            produitsFinanciers: this.data.produitsFinanciers,
          }
        );
        break;

      case 'investissement':
        this.callAI(
          'investissement',
          {
            total_entrees: this.data.immobEntree.totalGeneral,
            entrees: this.data.immobEntree.lignes,
            total_sorties: this.data.immobSortie.totalGeneral,
            sorties: this.data.immobSortie.lignes,
          }
        );
        break;

      case 'reformuler':
        if (this.data instanceof FormControl) {
          this.value = this.data.value;
        }
        this.callAI('reformuler', { texte: this.value });
        break;

      default:
        this.loading = false;
        this.errorMessage = 'Catégorie non reconnue';
    }
  }

  private callAI(type: string, contexte: any) {
    this.ai.generateComment(type, contexte).subscribe({
      next: (res) => {
        if (res.json) {
          this.tableauInvestissement.emit(res.json);
        }
        this.value = res.comment && res.comment.trim() ? res.comment : this.defaultText;
        this.data instanceof FormControl ? this.data.setValue(this.value) : this.onChange(this.value);
        this.markTouched();
        this.loading = false;
      },
      error: () => this.setError()
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

  private setError() {
    this.errorMessage = 'Erreur lors de la génération du texte';
    this.loading = false;
  }
}
