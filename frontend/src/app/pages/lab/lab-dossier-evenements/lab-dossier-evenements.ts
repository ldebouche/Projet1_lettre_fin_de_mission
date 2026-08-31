import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../shared/modal/modal';
import { LabChatDossierComponent } from '../lab-chat-dossier/lab-chat-dossier';
import {
  LabService,
  LabEvenement,
  LabDiligence,
  LabManualEvenementType,
  LabCreateEvenementRequest,
  LabUpdateEvenementRequest,
  LabCloturerEvenementRequest,
  LabDemanderClotureEvenementRequest,
  LabRefuserClotureEvenementRequest,
} from '../../../services/lab-service';
import { criticiteLabel, statutEvenementLabel, typeEvenementLabel } from '../lab-labels';

type LabBadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
type EvenementModalMode = 'create' | 'edit' | 'close' | 'validate' | 'refuse' | 'discussion' | null;

const MANUAL_EVENT_TYPES: LabManualEvenementType[] = [
  'PIECE_MANQUANTE',
  'PIECE_PERIMEE',
  'CHANGEMENT_KYC',
  'TRANSACTION_ATYPIQUE',
  'AUTRE',
];

@Component({
  selector: 'app-lab-dossier-evenements',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, LabChatDossierComponent],
  templateUrl: './lab-dossier-evenements.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-evenements.scss'],
})
export class LabDossierEvenementsComponent {
  @Input() evenements: LabEvenement[] = [];
  @Input() diligences: LabDiligence[] = [];
  @Input() codeClient = '';
  @Input() canValiderCloture = false;
  @Input() idResponsableLab: string | null = null;
  @Input() nbEvenementsOuverts = 0;

  @Output() changed = new EventEmitter<void>();
  @Output() failed = new EventEmitter<string>();
  @Output() createDiligence = new EventEmitter<LabEvenement>();

  actionBusy = false;
  actionError: string | null = null;

  evenementModalMode: EvenementModalMode = null;
  selectedEvenement: LabEvenement | null = null;

  readonly manualEventTypes = MANUAL_EVENT_TYPES;

  evenementForm = {
    type_evenement: 'AUTRE' as LabManualEvenementType,
    libelle: '',
    criticite: 'Moyenne' as 'Faible' | 'Moyenne' | 'Elevee',
    statut: 'Ouvert' as 'Ouvert' | 'En_cours',
    date_echeance: '',
    conclusion: '',
    tracfin_declare: '' as '' | 'O' | 'N',
    tracfin_commentaire: '',
    motif_refus: '',
    diligence_intitule: '',
    diligence_echeance: '',
  };

  constructor(private labService: LabService) {}

  get evenementsBloquantsRevue(): LabEvenement[] {
    return this.evenements.filter(
      (e) =>
        e.type !== 'REVUE_ANNUELLE' &&
        (e.statut === 'Ouvert' || e.statut === 'En_cours' || e.statut === 'A_VALIDER'),
    );
  }

  getEvenementTone(value: LabEvenement['criticite']): LabBadgeTone {
    if (value === 'Elevee') return 'danger';
    if (value === 'Moyenne') return 'warn';
    return 'neutral';
  }

  getEvenementStatutLabel(statut: string | null | undefined): string {
    return statutEvenementLabel(statut);
  }

  getEvenementStatutTone(statut: string | null | undefined): string {
    if (statut === 'Cloture') return 'tone-ok';
    if (statut === 'A_VALIDER') return 'tone-info';
    if (statut === 'En_cours') return 'tone-info';
    return 'tone-warn';
  }

  getEvenementTypeLabel(type: string): string {
    return typeEvenementLabel(type);
  }

  criticiteLabel = criticiteLabel;

  isEvenementEditable(e: LabEvenement): boolean {
    return (e.statut === 'Ouvert' || e.statut === 'En_cours') && e.type !== 'REVUE_ANNUELLE';
  }

  isEvenementPendingValidation(e: LabEvenement): boolean {
    return e.statut === 'A_VALIDER' && e.type !== 'REVUE_ANNUELLE';
  }

  isEvenementOpen(e: LabEvenement): boolean {
    return e.statut === 'Ouvert' || e.statut === 'En_cours';
  }

  getDiligencesForEvenement(eventId: string): LabDiligence[] {
    return this.diligences.filter((d) => d.evenement_id === eventId);
  }

  private formatApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Opération impossible.';
  }

  openCreateEvenementModal(): void {
    this.actionError = null;
    this.selectedEvenement = null;
    this.evenementForm = {
      type_evenement: 'AUTRE',
      libelle: '',
      criticite: 'Moyenne',
      statut: 'Ouvert',
      date_echeance: '',
      conclusion: '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      motif_refus: '',
      diligence_intitule: '',
      diligence_echeance: '',
    };
    this.evenementModalMode = 'create';
  }

  openEditEvenementModal(e: LabEvenement): void {
    if (!this.isEvenementEditable(e)) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      type_evenement: 'AUTRE',
      libelle: e.resume ?? '',
      criticite: e.criticite,
      statut: e.statut === 'En_cours' ? 'En_cours' : 'Ouvert',
      date_echeance: e.echeance ? e.echeance.slice(0, 10) : '',
      conclusion: '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      motif_refus: '',
      diligence_intitule: '',
      diligence_echeance: '',
    };
    this.evenementModalMode = 'edit';
  }

  openEvenementDiscussion(e: LabEvenement): void {
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      type_evenement: 'AUTRE',
      libelle: e.resume ?? '',
      criticite: e.criticite,
      statut: e.statut === 'En_cours' ? 'En_cours' : 'Ouvert',
      date_echeance: e.echeance ? e.echeance.slice(0, 10) : '',
      conclusion: e.conclusion ?? '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      motif_refus: '',
      diligence_intitule: '',
      diligence_echeance: '',
    };
    this.evenementModalMode = 'discussion';
  }

  openCloseEvenementModal(e: LabEvenement): void {
    if (!this.isEvenementEditable(e)) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      ...this.evenementForm,
      conclusion: '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      motif_refus: '',
    };
    this.evenementModalMode = 'close';
  }

  openValidateEvenementModal(e: LabEvenement): void {
    if (!this.isEvenementPendingValidation(e) || !this.canValiderCloture) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      ...this.evenementForm,
      conclusion: e.conclusion?.trim() || '',
      tracfin_declare: '',
      tracfin_commentaire: '',
      motif_refus: '',
    };
    this.evenementModalMode = 'validate';
  }

  openRefuseEvenementModal(e: LabEvenement): void {
    if (!this.isEvenementPendingValidation(e) || !this.canValiderCloture) return;
    this.actionError = null;
    this.selectedEvenement = e;
    this.evenementForm = {
      ...this.evenementForm,
      conclusion: e.conclusion?.trim() || '',
      motif_refus: '',
    };
    this.evenementModalMode = 'refuse';
  }

  closeEvenementModal(): void {
    this.evenementModalMode = null;
    this.selectedEvenement = null;
  }

  saveEvenementModal(): void {
    if (this.evenementModalMode === 'discussion') {
      this.closeEvenementModal();
      return;
    }
    const code = this.codeClient;
    if (!code || this.actionBusy) return;

    this.actionBusy = true;
    this.actionError = null;

    if (this.evenementModalMode === 'create') {
      const body: LabCreateEvenementRequest = {
        code_client: code,
        type_evenement: this.evenementForm.type_evenement,
        libelle: this.evenementForm.libelle.trim() || undefined,
        criticite: this.evenementForm.criticite,
        date_echeance: this.evenementForm.date_echeance.trim() || null,
        id_responsable: this.idResponsableLab ?? undefined,
      };
      const dilIntitule = this.evenementForm.diligence_intitule.trim();
      if (dilIntitule) {
        body.diligences = [{
          intitule: dilIntitule,
          date_echeance: this.evenementForm.diligence_echeance.trim() || null,
          type_diligence: 'Manuelle',
        }];
      }
      this.labService.createEvenementLab(body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
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

    if (this.evenementModalMode === 'edit' && this.selectedEvenement) {
      const body: LabUpdateEvenementRequest = {
        libelle: this.evenementForm.libelle.trim() || undefined,
        criticite: this.evenementForm.criticite,
        statut: this.evenementForm.statut,
        date_echeance: this.evenementForm.date_echeance.trim() || null,
      };
      this.labService.updateEvenementLab(this.selectedEvenement.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
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

    if (this.evenementModalMode === 'close' && this.selectedEvenement) {
      const conclusion = this.evenementForm.conclusion.trim();
      if (!conclusion) {
        this.actionBusy = false;
        this.actionError = this.canValiderCloture
          ? 'La conclusion est obligatoire pour clôturer l\'événement.'
          : 'La conclusion est obligatoire pour demander la clôture.';
        this.failed.emit(this.actionError);
        return;
      }
      const body: LabDemanderClotureEvenementRequest = { conclusion };
      if (this.selectedEvenement.type === 'TRANSACTION_ATYPIQUE') {
        body.tracfin_declare = this.evenementForm.tracfin_declare || undefined;
        body.tracfin_commentaire = this.evenementForm.tracfin_commentaire.trim() || null;
      }
      const request$ = this.canValiderCloture
        ? this.labService.cloturerEvenementLab(this.selectedEvenement.id, body)
        : this.labService.demanderClotureEvenementLab(this.selectedEvenement.id, body);
      request$.subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
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

    if (this.evenementModalMode === 'validate' && this.selectedEvenement) {
      const conclusion = this.evenementForm.conclusion.trim();
      const body: LabCloturerEvenementRequest = {};
      if (conclusion) body.conclusion = conclusion;
      this.labService.cloturerEvenementLab(this.selectedEvenement.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
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

    if (this.evenementModalMode === 'refuse' && this.selectedEvenement) {
      const motif = this.evenementForm.motif_refus.trim();
      if (!motif) {
        this.actionBusy = false;
        this.actionError = 'Le motif de refus est obligatoire.';
        this.failed.emit(this.actionError);
        return;
      }
      const body: LabRefuserClotureEvenementRequest = { motif_refus: motif };
      this.labService.refuserClotureEvenementLab(this.selectedEvenement.id, body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeEvenementModal();
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

  get evenementModalTitle(): string {
    if (this.evenementModalMode === 'create') return 'Créer un événement';
    if (this.evenementModalMode === 'edit') return 'Modifier l\'événement';
    if (this.evenementModalMode === 'close') {
      return this.canValiderCloture ? 'Clôturer l\'événement' : 'Demander la clôture';
    }
    if (this.evenementModalMode === 'validate') return 'Valider la clôture';
    if (this.evenementModalMode === 'refuse') return 'Refuser la clôture';
    if (this.evenementModalMode === 'discussion') return 'Discussion';
    return '';
  }

  get evenementModalSubmitLabel(): string {
    if (this.actionBusy) return 'Enregistrement…';
    if (this.evenementModalMode === 'close') {
      return this.canValiderCloture ? 'Clôturer' : 'Demander la clôture';
    }
    if (this.evenementModalMode === 'validate') return 'Valider la clôture';
    if (this.evenementModalMode === 'refuse') return 'Refuser';
    return 'Enregistrer';
  }

  onCreerEvenement(): void {
    this.openCreateEvenementModal();
  }
}
