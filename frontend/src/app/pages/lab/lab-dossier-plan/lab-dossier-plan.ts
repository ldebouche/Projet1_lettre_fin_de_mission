import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../shared/modal/modal';
import { LabChatDossierComponent } from '../lab-chat-dossier/lab-chat-dossier';
import {
  LabService,
  LabEvenement,
  LabDiligence,
  LabCreateDiligenceRequest,
  LabUpdateDiligenceRequest,
} from '../../../services/lab-service';
import { typeEvenementLabel } from '../lab-labels';

type LabBadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
type DiligenceModalMode = 'create' | 'edit' | 'discussion' | null;

const DILIGENCE_STATUT_LABELS: Record<string, string> = {
  A_faire: 'À faire',
  En_cours: 'En cours',
  Realisee: 'Réalisée',
  Abandonnee: 'Abandonnée',
};

const DILIGENCE_TRANSITIONS: Record<string, string[]> = {
  A_faire: ['A_faire', 'En_cours'],
  En_cours: ['En_cours', 'Realisee', 'Abandonnee'],
  Realisee: ['Realisee'],
  Abandonnee: ['Abandonnee'],
};

@Component({
  selector: 'app-lab-dossier-plan',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, LabChatDossierComponent],
  templateUrl: './lab-dossier-plan.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-plan.scss'],
})
export class LabDossierPlanComponent {
  @Input() diligences: LabDiligence[] = [];
  @Input() evenements: LabEvenement[] = [];
  @Input() codeClient = '';
  @Input() idResponsableLab: string | null = null;

  @Output() changed = new EventEmitter<void>();
  @Output() failed = new EventEmitter<string>();

  actionBusy = false;
  actionError: string | null = null;

  diligenceModalMode: DiligenceModalMode = null;
  selectedEvenement: LabEvenement | null = null;
  selectedDiligence: LabDiligence | null = null;

  diligenceForm = {
    intitule: '',
    statut: 'A_faire' as LabDiligence['statut'],
    date_echeance: '',
    commentaires: '',
    ref_piece_jointe: '',
    motif_abandon: '',
  };

  constructor(private labService: LabService) {}

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }

  getDiligenceTone(value: LabDiligence['statut']): LabBadgeTone {
    if (value === 'A_faire') return 'warn';
    if (value === 'En_cours') return 'info';
    if (value === 'Abandonnee') return 'neutral';
    return 'ok';
  }

  getDiligenceOrigineLabel(d: LabDiligence): string {
    const t = d.type_diligence != null ? String(d.type_diligence).trim() : '';
    if (t === 'Standard') return 'standard';
    if (t === 'Renforcee') return 'renforcée';
    return 'manuelle';
  }

  getDiligenceOrigineClass(d: LabDiligence): string {
    const t = d.type_diligence != null ? String(d.type_diligence).trim() : '';
    if (t === 'Standard') return 'tag-origine tag-origine--standard';
    if (t === 'Renforcee') return 'tag-origine tag-origine--renforcee';
    return 'tag-origine tag-origine--manuelle';
  }

  isDiligenceLate(d: LabDiligence): boolean {
    if (!d.date_echeance) return false;
    if (d.statut === 'Realisee' || d.statut === 'Abandonnee') return false;
    const due = new Date(d.date_echeance);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const b = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    return b < a;
  }

  isEvenementOpen(e: LabEvenement): boolean {
    return e.statut === 'Ouvert' || e.statut === 'En_cours';
  }

  allowedDiligenceStatuts(current: string): string[] {
    return DILIGENCE_TRANSITIONS[current] ?? [current];
  }

  diligenceStatutLabel(statut: string): string {
    return DILIGENCE_STATUT_LABELS[statut] ?? statut;
  }

  getEvenementTypeLabel(type: string): string {
    return typeEvenementLabel(type);
  }

  private formatApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Opération impossible.';
  }

  openCreateDiligenceModal(e: LabEvenement): void {
    if (!this.isEvenementOpen(e)) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.selectedDiligence = null;
    this.diligenceForm = {
      intitule: '',
      statut: 'A_faire',
      date_echeance: '',
      commentaires: '',
      ref_piece_jointe: '',
      motif_abandon: '',
    };
    this.diligenceModalMode = 'create';
  }

  openEditDiligenceModal(d: LabDiligence): void {
    if (d.statut === 'Realisee' || d.statut === 'Abandonnee') return;
    this.actionError = null;
    this.selectedDiligence = d;
    this.selectedEvenement = this.evenements.find((e) => e.id === d.evenement_id) ?? null;
    this.diligenceForm = {
      intitule: d.intitule,
      statut: d.statut,
      date_echeance: d.date_echeance ? d.date_echeance.slice(0, 10) : '',
      commentaires: d.commentaire ?? '',
      ref_piece_jointe: d.preuve ?? '',
      motif_abandon: '',
    };
    this.diligenceModalMode = 'edit';
  }

  openDiligenceDiscussion(d: LabDiligence): void {
    this.actionError = null;
    this.selectedDiligence = d;
    this.selectedEvenement = this.evenements.find((e) => e.id === d.evenement_id) ?? null;
    this.diligenceForm = {
      intitule: d.intitule,
      statut: d.statut,
      date_echeance: d.date_echeance ? d.date_echeance.slice(0, 10) : '',
      commentaires: d.commentaire ?? '',
      ref_piece_jointe: d.preuve ?? '',
      motif_abandon: '',
    };
    this.diligenceModalMode = 'discussion';
  }

  closeDiligenceModal(): void {
    this.diligenceModalMode = null;
    this.selectedDiligence = null;
    this.selectedEvenement = null;
  }

  saveDiligenceModal(): void {
    if (this.diligenceModalMode === 'discussion') {
      this.closeDiligenceModal();
      return;
    }
    if (this.actionBusy) return;

    this.actionBusy = true;
    this.actionError = null;

    if (this.diligenceModalMode === 'create' && this.selectedEvenement) {
      const intitule = this.diligenceForm.intitule.trim();
      if (!intitule) {
        this.actionBusy = false;
        this.actionError = 'L\'intitulé de la diligence est obligatoire.';
        this.failed.emit(this.actionError);
        return;
      }
      const body: LabCreateDiligenceRequest = {
        id_evenement: this.selectedEvenement.id,
        intitule,
        type_diligence: 'Manuelle',
        date_echeance: this.diligenceForm.date_echeance.trim() || null,
        id_responsable: this.idResponsableLab ?? undefined,
      };
      this.labService.createDiligenceLab(body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeDiligenceModal();
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

    if (this.diligenceModalMode === 'edit' && this.selectedDiligence) {
      const body: LabUpdateDiligenceRequest = {
        statut: this.diligenceForm.statut,
        date_echeance: this.diligenceForm.date_echeance.trim() || null,
        commentaires: this.diligenceForm.commentaires.trim() || null,
        ref_piece_jointe: this.diligenceForm.ref_piece_jointe.trim() || null,
      };
      if (this.diligenceForm.statut === 'Abandonnee') {
        body.motif_abandon = this.diligenceForm.motif_abandon.trim() || undefined;
      }
      this.labService.updateDiligenceLab(this.selectedDiligence.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeDiligenceModal();
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

  get diligenceModalTitle(): string {
    if (this.diligenceModalMode === 'create') return 'Ajouter une diligence';
    if (this.diligenceModalMode === 'edit') return 'Modifier la diligence';
    if (this.diligenceModalMode === 'discussion') return 'Discussion';
    return '';
  }
}
