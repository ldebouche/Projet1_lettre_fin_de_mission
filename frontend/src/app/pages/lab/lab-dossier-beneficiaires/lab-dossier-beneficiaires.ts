import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../shared/modal/modal';
import {
  LabService,
  LabBeneficiaireEffectif,
  LabCreateBeneficiaireRequest,
  LabUpdateBeneficiaireRequest,
} from '../../../services/lab-service';

type LabBadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
type BeneficiaireModalMode = 'create' | 'edit' | null;

@Component({
  selector: 'app-lab-dossier-beneficiaires',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './lab-dossier-beneficiaires.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-beneficiaires.scss'],
})
export class LabDossierBeneficiairesComponent {
  @Input() beneficiaires: LabBeneficiaireEffectif[] = [];
  @Input() codeClient = '';
  @Input() idResponsableLab: string | null = null;

  @Output() changed = new EventEmitter<void>();
  @Output() failed = new EventEmitter<string>();

  actionBusy = false;
  actionError: string | null = null;

  beneficiaireModalMode: BeneficiaireModalMode = null;
  selectedBeneficiaire: LabBeneficiaireEffectif | null = null;

  beneficiaireForm = {
    nom: '',
    prenom: '',
    nationalite: '',
    pays_residence: '',
    pourcentage: '',
    mode_controle: 'Detention_capital' as LabBeneficiaireEffectif['mode_controle'],
    pep_statut: 'Non' as LabBeneficiaireEffectif['pep_statut'],
    sanctions_gel: 'Non' as LabBeneficiaireEffectif['sanctions_gel'],
    commentaire: '',
  };

  constructor(private labService: LabService) {}

  val(v: string | number | null | undefined): string {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }

  getPepTone(value: 'Oui' | 'Non' | 'Inconnu'): LabBadgeTone {
    if (value === 'Oui') return 'danger';
    if (value === 'Inconnu') return 'warn';
    return 'ok';
  }

  getSanctionsTone(value: 'Oui' | 'Non' | 'Inconnu'): LabBadgeTone {
    if (value === 'Oui') return 'danger';
    if (value === 'Inconnu') return 'warn';
    return 'ok';
  }

  getBeneficiairesTotalPct(): number {
    const total = this.beneficiaires
      .map((b) => (typeof b.pourcentage === 'number' ? b.pourcentage : 0))
      .reduce((a, b) => a + b, 0);
    return Math.round(total * 10) / 10;
  }

  getBeneficiairePrincipalPct(): number {
    if (!this.beneficiaires.length) return 0;
    const first = this.beneficiaires[0];
    return typeof first.pourcentage === 'number' ? first.pourcentage : 0;
  }

  getBeneficiairesHasUnknown(): boolean {
    return this.beneficiaires.some((b) => b.pep_statut === 'Inconnu' || b.sanctions_gel === 'Inconnu');
  }

  donutDasharray(part: number, total: number): string {
    if (!total || total <= 0) return '0 100';
    const p = Math.max(0, Math.min(100, (part / total) * 100));
    const a = Math.round(p * 10) / 10;
    const b = Math.round((100 - a) * 10) / 10;
    return `${a} ${b}`;
  }

  private formatApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Opération impossible.';
  }

  private resetBeneficiaireForm(): void {
    this.beneficiaireForm = {
      nom: '',
      prenom: '',
      nationalite: '',
      pays_residence: '',
      pourcentage: '',
      mode_controle: 'Detention_capital',
      pep_statut: 'Non',
      sanctions_gel: 'Non',
      commentaire: '',
    };
  }

  private mapBeneficiaireFormToBody(): LabUpdateBeneficiaireRequest {
    const pct = String(this.beneficiaireForm.pourcentage ?? '').trim();
    return {
      nom: this.beneficiaireForm.nom.trim(),
      prenom: this.beneficiaireForm.prenom.trim() || null,
      nationalite: this.beneficiaireForm.nationalite.trim() || null,
      pays_residence: this.beneficiaireForm.pays_residence.trim() || null,
      pourcentage: pct ? Number(pct) : null,
      mode_controle: this.beneficiaireForm.mode_controle || 'Autre',
      pep_statut: this.beneficiaireForm.pep_statut || 'Non',
      sanctions_gel: this.beneficiaireForm.sanctions_gel || 'Non',
      commentaire: this.beneficiaireForm.commentaire.trim() || null,
      options: { creer_evenement_changement_be: true },
    };
  }

  openCreateBeneficiaireModal(): void {
    this.actionError = null;
    this.selectedBeneficiaire = null;
    this.resetBeneficiaireForm();
    this.beneficiaireModalMode = 'create';
  }

  openEditBeneficiaireModal(b: LabBeneficiaireEffectif): void {
    this.actionError = null;
    this.selectedBeneficiaire = b;
    this.beneficiaireForm = {
      nom: b.nom ?? '',
      prenom: b.prenom ?? '',
      nationalite: b.nationalite ?? '',
      pays_residence: b.pays_residence ?? '',
      pourcentage: b.pourcentage != null ? String(b.pourcentage) : '',
      mode_controle: b.mode_controle || 'Autre',
      pep_statut: b.pep_statut || 'Non',
      sanctions_gel: b.sanctions_gel || 'Non',
      commentaire: b.commentaire ?? '',
    };
    this.beneficiaireModalMode = 'edit';
  }

  closeBeneficiaireModal(): void {
    this.beneficiaireModalMode = null;
    this.selectedBeneficiaire = null;
  }

  saveBeneficiaireModal(): void {
    const code = this.codeClient;
    if (!code || this.actionBusy) return;

    const nom = this.beneficiaireForm.nom.trim();
    if (!nom) {
      this.actionError = 'Le nom est obligatoire pour le bénéficiaire effectif.';
      this.failed.emit(this.actionError);
      return;
    }

    this.actionBusy = true;
    this.actionError = null;

    if (this.beneficiaireModalMode === 'create') {
      const body: LabCreateBeneficiaireRequest = {
        code_client: code,
        ...this.mapBeneficiaireFormToBody(),
      };
      this.labService.createBeneficiaireLab(body).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeBeneficiaireModal();
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

    if (this.beneficiaireModalMode === 'edit' && this.selectedBeneficiaire) {
      this.labService.updateBeneficiaireLab(this.selectedBeneficiaire.id, this.mapBeneficiaireFormToBody()).subscribe({
        next: () => {
          this.actionBusy = false;
          this.closeBeneficiaireModal();
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

  deleteBeneficiaire(b: LabBeneficiaireEffectif): void {
    if (this.actionBusy) return;
    const label = [b.prenom, b.nom].filter(Boolean).join(' ') || b.nom;
    if (!confirm(`Supprimer le bénéficiaire effectif « ${label} » ?`)) return;

    this.actionBusy = true;
    this.actionError = null;
    this.labService.deleteBeneficiaireLab(b.id).subscribe({
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

  get beneficiaireModalTitle(): string {
    if (this.beneficiaireModalMode === 'create') return 'Ajouter un bénéficiaire effectif';
    if (this.beneficiaireModalMode === 'edit') return 'Modifier le bénéficiaire effectif';
    return '';
  }

  onAjouterBeneficiaire(): void {
    this.openCreateBeneficiaireModal();
  }
}
