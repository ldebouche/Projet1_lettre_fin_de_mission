import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

import { AiService } from '../../services/ai-service';
import { DbService } from '../../services/db-service';
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

  value = '';
  disabled = false;
  private touched = false;

  loading = false;

  code_client = '';
  errorMessage = '';

  constructor(
    private ai: AiService, 
    private db: DbService,
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

  onGenerateComment() {
    this.loading = true;

    switch (this.categorie) {
      case 'progressionChiffre':
        this.db.getCAData().subscribe({
          next: (data: any) => {
            this.callAI(
              'CA',
              {
                anneeN: data.anneeN,
                anneeN1: data.anneeN1,
                caN: data.caN,
                caN1: data.caN1
              }
            );
          },
          error: () => this.setError()
        });
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
