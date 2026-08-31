import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import type { WizardPieceRow } from '../../../services/lab-service';
import { emptyPiece, genWizardId, isPersistedId } from '../lab-dossier-form-wizard/lab-wizard-hydrate';

@Component({
  selector: 'app-lab-wizard-pieces',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent],
  templateUrl: './lab-wizard-pieces.html',
  styleUrls: [
    '../lab-dossier-form-wizard/lab-dossier-form-wizard.scss',
    './lab-wizard-pieces.scss',
  ],
})
export class LabWizardPiecesComponent {
  @Input() pieces: WizardPieceRow[] = [];
  @Input() pieceTypePresets: string[] = [];
  @Output() piecesChange = new EventEmitter<WizardPieceRow[]>();
  @Output() removedPersistedId = new EventEmitter<string>();

  addPiece(): void {
    const rows = [...this.pieces, emptyPiece(genWizardId('pc'))];
    this.pieces = rows;
    this.piecesChange.emit(rows);
  }

  removePiece(id: string): void {
    if (isPersistedId(id)) {
      this.removedPersistedId.emit(id);
    }
    const next = this.pieces.filter((p) => p.id !== id);
    const rows = next.length ? next : [emptyPiece(genWizardId('pc'))];
    this.pieces = rows;
    this.piecesChange.emit(rows);
  }

  trackById(_index: number, row: { id: string }): string {
    return row.id;
  }
}
