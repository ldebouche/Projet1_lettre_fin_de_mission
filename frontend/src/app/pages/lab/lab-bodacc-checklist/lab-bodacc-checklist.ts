import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LabBodaccAlerte,
  LabBodaccChecklistEntry,
  LabBodaccChecklistStatut,
} from '../../../services/lab-service';

@Component({
  selector: 'app-lab-bodacc-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-bodacc-checklist.html',
  styleUrls: ['./lab-bodacc-checklist.scss'],
})
export class LabBodaccChecklistComponent implements OnChanges {
  @Input() alertes: LabBodaccAlerte[] = [];
  @Input() codeClient = '';
  @Input() siren = '';
  @Output() navigateStep = new EventEmitter<string>();
  @Output() progressChange = new EventEmitter<number>();

  showCourantes = false;
  checklist: Record<string, LabBodaccChecklistEntry> = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['alertes'] || changes['codeClient']) {
      this.loadChecklistState();
      this.ensureEntries();
      this.emitProgress();
    }
  }

  get visibleAlertes(): LabBodaccAlerte[] {
    return this.alertes.filter((a) => this.showCourantes || !a.masquerParDefaut);
  }

  get totalCount(): number {
    return this.visibleAlertes.length;
  }

  get traiteCount(): number {
    return this.visibleAlertes.filter((a) => this.getEntry(a.id).statut !== 'a_traiter').length;
  }

  get pendingCriticalCount(): number {
    return this.alertes.filter(
      (a) => a.gravite === 'elevee' && this.getEntry(a.id).statut === 'a_traiter',
    ).length;
  }

  get allVisibleDone(): boolean {
    return this.totalCount > 0 && this.traiteCount === this.totalCount;
  }

  graviteLabel(gravite: LabBodaccAlerte['gravite']): string {
    if (gravite === 'elevee') return 'Critique';
    if (gravite === 'moyenne') return 'À vérifier';
    return 'Courant';
  }

  statutLabel(statut: LabBodaccChecklistStatut): string {
    if (statut === 'traite') return 'Traité';
    if (statut === 'sans_suite') return 'Sans suite';
    return 'À traiter';
  }

  getEntry(id: string): LabBodaccChecklistEntry {
    return this.checklist[id] ?? { statut: 'a_traiter', commentaire: '', traiteLe: null };
  }

  setStatut(alerte: LabBodaccAlerte, statut: LabBodaccChecklistStatut): void {
    const current = this.getEntry(alerte.id);
    this.checklist[alerte.id] = {
      ...current,
      statut,
      traiteLe: statut === 'a_traiter' ? null : new Date().toISOString(),
    };
    this.persistChecklistState();
    this.emitProgress();
  }

  onCommentChange(alerte: LabBodaccAlerte, commentaire: string): void {
    const current = this.getEntry(alerte.id);
    this.checklist[alerte.id] = { ...current, commentaire };
    this.persistChecklistState();
  }

  onShowCourantesChange(): void {
    this.emitProgress();
  }

  private emitProgress(): void {
    this.progressChange.emit(this.pendingCriticalCount);
  }

  goToStep(alerte: LabBodaccAlerte): void {
    if (alerte.etapeWizard) {
      this.navigateStep.emit(alerte.etapeWizard);
    }
  }

  private storageKey(): string {
    const code = (this.codeClient || 'sans-code').trim();
    const siren = (this.siren || 'sans-siren').trim();
    return `lab-bodacc-checklist:${code}:${siren}`;
  }

  private loadChecklistState(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      this.checklist = raw ? JSON.parse(raw) : {};
    } catch {
      this.checklist = {};
    }
  }

  private persistChecklistState(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.checklist));
    } catch {
      // ignore quota errors
    }
  }

  exportChecklistState(): Record<string, LabBodaccChecklistEntry> {
    return { ...this.checklist };
  }

  private ensureEntries(): void {
    for (const alerte of this.alertes) {
      if (!this.checklist[alerte.id]) {
        this.checklist[alerte.id] = { statut: 'a_traiter', commentaire: '', traiteLe: null };
      }
    }
  }
}
