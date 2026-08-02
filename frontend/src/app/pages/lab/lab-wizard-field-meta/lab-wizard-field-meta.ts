import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { LabFieldMeta } from '../../../services/lab-service';

@Component({
  selector: 'app-lab-wizard-field-meta',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="field-meta" *ngIf="meta && meta.status !== 'empty'" [class.field-meta--divergence]="meta.status === 'divergence'">
      <span class="field-meta-source" *ngIf="meta.sourceLabel">
        Source : <strong>{{ meta.sourceLabel }}</strong>
        <span class="field-meta-date" *ngIf="meta.fetchedAt"> — {{ formatDate(meta.fetchedAt) }}</span>
      </span>

      <div class="field-meta-divergence" *ngIf="meta.status === 'divergence'">
        <span class="field-meta-alert">Écart détecté avec {{ meta.apiSourceLabel || 'registre public' }}</span>
        <div class="field-meta-values">
          <span><em>BDD</em> : {{ meta.bddValue }}</span>
          <span><em>API</em> : {{ meta.apiValue }}</span>
        </div>
        <button type="button" class="field-meta-btn" (click)="acceptApi.emit()">
          Utiliser la valeur API
        </button>
      </div>
    </div>
  `,
  styles: [`
    .field-meta {
      font-size: 0.76rem;
      color: #6e7b86;
      line-height: 1.4;
      margin-top: 2px;
    }

    .field-meta--divergence {
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(198, 40, 40, 0.06);
      border: 1px solid rgba(198, 40, 40, 0.2);
    }

    .field-meta-source strong {
      color: #4f6577;
      font-weight: 800;
    }

    .field-meta-date {
      color: #8b97a3;
    }

    .field-meta-divergence {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 4px;
    }

    .field-meta-alert {
      color: #c62828;
      font-weight: 800;
    }

    .field-meta-values {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.74rem;
    }

    .field-meta-values em {
      font-style: normal;
      font-weight: 800;
      color: #5c6b78;
    }

    .field-meta-btn {
      align-self: flex-start;
      border: 1px solid rgba(25, 118, 210, 0.35);
      background: #fff;
      color: #1565c0;
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 0.74rem;
      font-weight: 800;
      cursor: pointer;
      font-family: inherit;
    }

    .field-meta-btn:hover {
      border-color: rgba(25, 118, 210, 0.55);
      background: rgba(25, 118, 210, 0.06);
    }
  `],
})
export class LabWizardFieldMetaComponent {
  @Input() meta: LabFieldMeta | null = null;
  @Output() acceptApi = new EventEmitter<void>();

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
