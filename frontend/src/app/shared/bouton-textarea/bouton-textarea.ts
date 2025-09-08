import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

import { AiService } from '../../services/ai-service';
import { DbService } from '../../services/db-service';

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
  value = '';
  disabled = false;
  private touched = false;

  loading = false;

  code_client = '';
  errorMessage = '';

  constructor(
    private ai: AiService, 
    private db: DbService
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

  handleClick(selector: boolean) {
    if (this.disabled) return;
    if (!this.value) {
      if (selector) {
        this.onTestDb();
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

    this.ai.generateComment(
      { clientNom: "Entreprise ACME", 
        siren: "123456789", 
        ca: 420000, 
        marge: 0.18 
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

  onTestDb() {
    this.loading = true;

    this.db.getClientNom("AC0001").subscribe({
      next: (data) => {
        this.code_client = data;
        this.db.testDb(this.code_client).subscribe({
          next: (text) => {
            this.value = text && text.trim() ? text : this.defaultText;
            this.onChange(this.value);
            this.markTouched();
            this.loading = false;   
          },
          error: (err) => {
            console.error(err);
            this.errorMessage = 'Erreur lors de la génération du texte';
            this.loading = false;
          }
        }); 
      },
      error: (err) => {
        console.error(err);
        this.errorMessage = 'Impossible de charger le client';
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
}
