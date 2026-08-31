import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { ModalComponent } from '../../../shared/modal/modal';
import {
  LabService,
  LabPieceKyc,
  LabUpdatePieceRequest,
} from '../../../services/lab-service';
import { statutPieceLabel } from '../lab-labels';

type PieceModalMode = 'create' | 'edit' | null;

const PIECE_TYPE_PRESETS = [
  'KBIS',
  'Statuts',
  'Pièce d\'identité',
  'RBE (registre des bénéficiaires effectifs)',
  'Justificatif domicile',
  'Organigramme',
  'RIB',
];

@Component({
  selector: 'app-lab-dossier-pieces',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './lab-dossier-pieces.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-pieces.scss'],
})
export class LabDossierPiecesComponent {
  @Input() pieces: LabPieceKyc[] = [];
  @Input() codeClient = '';

  @Output() changed = new EventEmitter<void>();
  @Output() failed = new EventEmitter<string>();

  actionBusy = false;
  actionError: string | null = null;

  pieceModalMode: PieceModalMode = null;
  selectedPiece: LabPieceKyc | null = null;

  readonly pieceTypePresets = PIECE_TYPE_PRESETS;
  statutPieceLabel = statutPieceLabel;

  pieceForm = {
    type_piece: '',
    titulaire: 'Client' as LabPieceKyc['titulaire'],
    statut: 'Manquante' as LabPieceKyc['statut'],
    date_delivrance: '',
    date_echeance: '',
    reference: '',
    commentaire: '',
  };

  pendingPieceFile: File | null = null;

  @ViewChild('pieceFileInput') pieceFileInput?: ElementRef<HTMLInputElement>;

  constructor(private labService: LabService) {}

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }

  getPiecesCounts(): { recue: number; manquante: number; perimee: number; non_requise: number; total: number } {
    const total = this.pieces.length;
    const recue = this.pieces.filter((p) => p.statut === 'Recue').length;
    const manquante = this.pieces.filter((p) => p.statut === 'Manquante').length;
    const perimee = this.pieces.filter((p) => p.statut === 'Perimee').length;
    const non_requise = this.pieces.filter((p) => p.statut === 'Non_requise').length;
    return { recue, manquante, perimee, non_requise, total };
  }

  private formatApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Opération impossible.';
  }

  private resetPieceForm(): void {
    this.pieceForm = {
      type_piece: '',
      titulaire: 'Client',
      statut: 'Manquante',
      date_delivrance: '',
      date_echeance: '',
      reference: '',
      commentaire: '',
    };
    this.pendingPieceFile = null;
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

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  get pendingPieceFileLabel(): string {
    if (!this.pendingPieceFile) return '';
    return `${this.pendingPieceFile.name} (${this.formatFileSize(this.pendingPieceFile.size)})`;
  }

  triggerPieceFilePicker(): void {
    this.pieceFileInput?.nativeElement.click();
  }

  onPieceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.pendingPieceFile = file;
    this.pieceForm.reference = file.name;
    if (!this.pieceForm.type_piece.trim()) {
      this.pieceForm.type_piece = this.guessPieceTypeFromFilename(file.name);
    }
    if (this.pieceModalMode === 'create') {
      this.pieceForm.statut = 'Recue';
    }
    if (this.pieceModalMode === null) {
      this.openCreatePieceModalFromFile();
    }
  }

  private openCreatePieceModalFromFile(): void {
    this.actionError = null;
    this.selectedPiece = null;
    this.pieceModalMode = 'create';
  }

  private mapPieceFormToBody(): LabUpdatePieceRequest {
    return {
      type_piece: this.pieceForm.type_piece.trim(),
      titulaire: this.pieceForm.titulaire || 'Client',
      statut: this.pieceForm.statut || 'Manquante',
      date_delivrance: this.pieceForm.date_delivrance.trim() || null,
      date_echeance: this.pieceForm.date_echeance.trim() || null,
      reference: this.pieceForm.reference.trim() || null,
      commentaire: this.pieceForm.commentaire.trim() || null,
    };
  }

  openCreatePieceModal(): void {
    this.resetPieceForm();
    this.triggerPieceFilePicker();
  }

  openEditPieceModal(p: LabPieceKyc): void {
    this.actionError = null;
    this.selectedPiece = p;
    this.pendingPieceFile = null;
    this.pieceForm = {
      type_piece: p.type_piece ?? '',
      titulaire: p.titulaire || 'Client',
      statut: p.statut || 'Manquante',
      date_delivrance: p.date_delivrance ? p.date_delivrance.slice(0, 10) : '',
      date_echeance: p.date_echeance ? p.date_echeance.slice(0, 10) : '',
      reference: p.reference ?? '',
      commentaire: p.commentaire ?? '',
    };
    this.pieceModalMode = 'edit';
  }

  closePieceModal(): void {
    this.pieceModalMode = null;
    this.selectedPiece = null;
    this.pendingPieceFile = null;
  }

  private buildPieceBodyFromForm(
    upload?: { nom_fichier: string; filepath: string } | null,
  ): LabUpdatePieceRequest {
    const body: LabUpdatePieceRequest = {
      ...this.mapPieceFormToBody(),
    };
    if (upload) {
      body.nom_fichier = upload.nom_fichier;
      body.filepath = upload.filepath;
      body.reference = upload.nom_fichier;
      body.statut = body.statut === 'Manquante' ? 'Recue' : body.statut;
    }
    return body;
  }

  private uploadPendingPieceFileIfNeeded(code: string) {
    if (!this.pendingPieceFile) {
      return this.labService.createPieceLab({
        code_client: code,
        ...this.mapPieceFormToBody(),
      });
    }
    return this.labService.uploadPieceKycFile(code, this.pendingPieceFile).pipe(
      switchMap((uploadRes) => {
        const upload = uploadRes.data;
        return this.labService.createPieceLab({
          code_client: code,
          ...this.buildPieceBodyFromForm(upload),
        });
      }),
    );
  }

  private uploadPendingPieceFileForUpdateIfNeeded(code: string, pieceId: string) {
    if (!this.pendingPieceFile) {
      return this.labService.updatePieceLab(pieceId, this.mapPieceFormToBody());
    }
    return this.labService.uploadPieceKycFile(code, this.pendingPieceFile).pipe(
      switchMap((uploadRes) => {
        return this.labService.updatePieceLab(pieceId, this.buildPieceBodyFromForm(uploadRes.data));
      }),
    );
  }

  savePieceModal(): void {
    const code = this.codeClient;
    if (!code || this.actionBusy) return;

    const typePiece = this.pieceForm.type_piece.trim();
    if (!typePiece) {
      this.actionError = 'Le type de pièce est obligatoire.';
      this.failed.emit(this.actionError);
      return;
    }

    if (this.pieceModalMode === 'create' && !this.pendingPieceFile) {
      this.actionError = 'Sélectionnez un fichier via l\'explorateur.';
      this.failed.emit(this.actionError);
      return;
    }

    this.actionBusy = true;
    this.actionError = null;

    if (this.pieceModalMode === 'create') {
      this.uploadPendingPieceFileIfNeeded(code).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closePieceModal();
          this.changed.emit();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
          this.failed.emit(this.actionError);
        },
      });
      return;
    }

    if (this.pieceModalMode === 'edit' && this.selectedPiece) {
      this.uploadPendingPieceFileForUpdateIfNeeded(code, this.selectedPiece.id).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closePieceModal();
          this.changed.emit();
        },
        error: (err) => {
          this.actionBusy = false;
          this.actionError = this.formatApiError(err);
          this.failed.emit(this.actionError);
        },
      });
    }
  }

  deletePiece(p: LabPieceKyc): void {
    if (this.actionBusy) return;
    if (!confirm(`Supprimer la pièce « ${p.type_piece} » ?`)) return;

    this.actionBusy = true;
    this.actionError = null;
    this.labService.deletePieceLab(p.id).subscribe({
      next: () => {
        this.actionBusy = false;
        this.changed.emit();
      },
      error: (err) => {
        this.actionBusy = false;
        this.actionError = this.formatApiError(err);
        this.failed.emit(this.actionError);
      },
    });
  }

  get pieceModalTitle(): string {
    if (this.pieceModalMode === 'create') return 'Ajouter une pièce KYC';
    if (this.pieceModalMode === 'edit') return 'Modifier la pièce KYC';
    return '';
  }

  onAjouterPiece(): void {
    this.openCreatePieceModal();
  }
}
