import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
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

  @ViewChild('pieceFileInput') pieceFileInput?: ElementRef<HTMLInputElement>;

  private pendingPickPieceId: string | null = null;

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

  pickFile(pieceId: string): void {
    this.pendingPickPieceId = pieceId;
    const input = this.pieceFileInput?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    const pieceId = this.pendingPickPieceId;
    this.pendingPickPieceId = null;
    if (!file || !pieceId) return;

    const rows = this.pieces.map((p) => {
      if (p.id !== pieceId) return p;
      const typeGuess = !p.type_piece.trim() ? this.guessPieceTypeFromFilename(file.name) : p.type_piece;
      return {
        ...p,
        pendingFile: file,
        reference: file.name,
        nom_fichier: file.name,
        type_piece: typeGuess,
        statut: p.statut === '' || p.statut === 'Manquante' ? 'Recue' : p.statut,
      };
    });
    this.pieces = rows;
    this.piecesChange.emit(rows);
  }

  fileLabel(file: File): string {
    const size =
      file.size < 1024
        ? `${file.size} o`
        : file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} Ko`
          : `${(file.size / (1024 * 1024)).toFixed(1)} Mo`;
    return `${file.name} (${size})`;
  }

  /**
   * Pour une pièce d’identité / passeport : échéance = délivrance + durée légale usuelle.
   * CNI / pièce d’identité → 15 ans ; passeport → 10 ans. Les autres types ne sont pas auto-calculés.
   */
  onPieceScheduleChange(piece: WizardPieceRow): void {
    const delivrance = (piece.date_delivrance || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(delivrance)) return;

    const years = this.identityValidityYears(piece.type_piece);
    if (years == null) return;

    const [year, month, day] = delivrance.split('-').map((part) => Number(part));
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dt.getTime())) return;

    dt.setUTCFullYear(dt.getUTCFullYear() + years);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    piece.date_echeance = `${yyyy}-${mm}-${dd}`;
    this.piecesChange.emit(this.pieces);
  }

  /** Durée de validité usuelle (années) pour une pièce d’identité, sinon null. */
  private identityValidityYears(typePiece: string): number | null {
    const t = String(typePiece ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (!t.trim()) return null;
    if (t.includes('passeport')) return 10;
    if (t.includes('identit') || t.includes('cni') || t.includes('carte nationale')) return 15;
    return null;
  }

  private guessPieceTypeFromFilename(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.includes('kbis') || lower.includes('insee')) return 'KBIS';
    if (lower.includes('statut')) return 'Statuts';
    if (lower.includes('identit') || lower.includes('cni') || lower.includes('passeport')) {
      return 'Pièce d\'identité';
    }
    if (lower.includes('rbe') || lower.includes('beneficiaire')) {
      return 'RBE (registre des bénéficiaires effectifs)';
    }
    if (lower.includes('domicil')) return 'Justificatif domicile';
    if (lower.includes('organigramme') || lower.includes('detention')) return 'Organigramme';
    if (lower.includes('rib') || lower.includes('iban')) return 'RIB';
    return '';
  }

  trackById(_index: number, row: { id: string }): string {
    return row.id;
  }
}
