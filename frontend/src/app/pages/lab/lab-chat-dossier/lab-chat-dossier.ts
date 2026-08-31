import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import {
  LabService,
  LabConversation,
  LabMessageChat,
  LabParticipantChat,
  LabEvenement,
  LabDiligence,
  LabChatParentParams,
} from '../../../services/lab-service';

@Component({
  selector: 'app-lab-chat-dossier',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-chat-dossier.html',
  styleUrls: ['./lab-chat-dossier.scss'],
})
export class LabChatDossierComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) codeClient!: string;
  @Input() filterIdEvenement: string | number | null = null;
  @Input() filterIdDiligence: string | number | null = null;
  @Input() evenements: LabEvenement[] = [];
  @Input() diligences: LabDiligence[] = [];
  @Input() lockFilter = false;
  @Input() compact = false;

  @ViewChild('thread') threadRef?: ElementRef<HTMLElement>;

  loading = false;
  sending = false;
  errorMessage: string | null = null;
  conversation: LabConversation | null = null;
  messages: LabMessageChat[] = [];
  draft = '';
  editingId: number | null = null;
  editDraft = '';
  meIdSellsy: string | null = null;
  meIsFull = false;
  selectedEventIds = new Set<string>();
  selectedDiligenceIds = new Set<string>();

  private pollSub?: Subscription;
  private loadSeq = 0;

  constructor(private labService: LabService) {}

  ngOnChanges(changes: SimpleChanges): void {
    const codeChanged = !!changes['codeClient'];
    const filterChanged = !!changes['filterIdEvenement'] || !!changes['filterIdDiligence'] || !!changes['lockFilter'];
    if (codeChanged || filterChanged) {
      this.syncLockedFilters();
      this.resetAndLoad();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get canSend(): boolean {
    const len = this.draft.trim().length;
    return len > 0 && len <= 4000 && !this.sending && !!this.codeClient?.trim();
  }

  get subtitle(): string {
    if (this.lockFilter && this.filterIdDiligence) {
      return 'Filtré sur cette diligence · même fil que le dossier';
    }
    if (this.lockFilter && this.filterIdEvenement) {
      return 'Filtré sur cet événement · même fil que le dossier';
    }
    if (this.hasActiveFilter) {
      return 'Vue filtrée du fil unique du dossier';
    }
    return 'Fil unique du dossier · événements et diligences · pas de notification';
  }

  get hasActiveFilter(): boolean {
    return this.selectedEventIds.size > 0 || this.selectedDiligenceIds.size > 0;
  }

  get showFilters(): boolean {
    return !this.lockFilter && (this.evenements.length > 0 || this.diligences.length > 0);
  }

  auteurLabel(message: LabMessageChat): string {
    const name = [message.auteur_prenom, message.auteur_nom].filter(Boolean).join(' ').trim();
    if (this.isMine(message)) return name ? `Vous (${name})` : 'Vous';
    return name || message.id_auteur || 'Collaborateur';
  }

  roleLabel(role: string | null | undefined): string {
    const r = role != null ? String(role).trim() : '';
    if (r === 'expert_comptable') return 'Expert-comptable';
    if (r === 'chef_de_mission') return 'Chef de mission';
    if (r === 'responsable_lab') return 'Responsable LAB';
    return r || 'Équipe';
  }

  participantLabel(p: LabParticipantChat): string {
    const name = [p.prenom, p.nom].filter(Boolean).join(' ').trim();
    return name || 'Collaborateur';
  }

  isMine(message: LabMessageChat): boolean {
    const me = (this.meIdSellsy || '').trim();
    const author = (message.id_auteur || '').trim();
    return !!me && !!author && me === author;
  }

  canEdit(message: LabMessageChat): boolean {
    return this.isMine(message) && !message.supprime;
  }

  canDelete(message: LabMessageChat): boolean {
    return !message.supprime && (this.isMine(message) || this.meIsFull);
  }

  trackMessage(_index: number, message: LabMessageChat): number {
    return message.id;
  }

  evenementChipLabel(e: LabEvenement): string {
    const type = (e.type || '').trim();
    const resume = (e.resume || '').trim();
    if (type && resume) return `${type} — ${resume}`;
    return type || resume || `Événement ${e.id}`;
  }

  messageContextLabel(message: LabMessageChat): string | null {
    if (message.diligence_intitule) return message.diligence_intitule;
    if (message.evenement_libelle) {
      const type = (message.evenement_type || '').trim();
      return type ? `${type} — ${message.evenement_libelle}` : message.evenement_libelle;
    }
    if (message.evenement_type) return message.evenement_type;
    return null;
  }

  isEventSelected(id: string | number): boolean {
    return this.selectedEventIds.has(String(id));
  }

  isDiligenceSelected(id: string | number): boolean {
    return this.selectedDiligenceIds.has(String(id));
  }

  toggleEventFilter(id: string | number): void {
    if (this.lockFilter) return;
    const key = String(id);
    if (this.selectedEventIds.has(key)) this.selectedEventIds.delete(key);
    else this.selectedEventIds.add(key);
    this.reloadMessages(true);
  }

  toggleDiligenceFilter(id: string | number): void {
    if (this.lockFilter) return;
    const key = String(id);
    if (this.selectedDiligenceIds.has(key)) this.selectedDiligenceIds.delete(key);
    else this.selectedDiligenceIds.add(key);
    this.reloadMessages(true);
  }

  clearFilters(): void {
    if (this.lockFilter) return;
    this.selectedEventIds.clear();
    this.selectedDiligenceIds.clear();
    this.reloadMessages(true);
  }

  onComposerEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.send();
  }

  send(): void {
    const contenu = this.draft.trim();
    if (!contenu || this.sending) return;
    this.sending = true;
    this.errorMessage = null;
    const tags = this.tagForNewMessage();
    const body: LabChatParentParams & { contenu: string } = this.conversation?.id
      ? { id_conversation: this.conversation.id, contenu, ...tags }
      : { code_client: this.codeClient.trim(), contenu, ...tags };
    this.labService.createMessageLab(body).subscribe({
      next: (res) => {
        if (res.data) {
          this.messages = [...this.messages.filter((m) => m.id !== res.data.id), res.data];
        }
        this.draft = '';
        this.sending = false;
        this.scrollToBottom();
      },
      error: (err) => {
        this.sending = false;
        this.errorMessage = err?.error?.error || "Impossible d'envoyer le message.";
      },
    });
  }

  startEdit(message: LabMessageChat): void {
    if (!this.canEdit(message) || message.contenu == null) return;
    this.editingId = message.id;
    this.editDraft = message.contenu;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editDraft = '';
  }

  saveEdit(message: LabMessageChat): void {
    const contenu = this.editDraft.trim();
    if (!contenu || this.sending) return;
    this.sending = true;
    this.errorMessage = null;
    this.labService.updateMessageLab(message.id, { contenu }).subscribe({
      next: (res) => {
        if (res.data) {
          this.messages = this.messages.map((m) => (m.id === res.data.id ? res.data : m));
        }
        this.sending = false;
        this.cancelEdit();
      },
      error: (err) => {
        this.sending = false;
        this.errorMessage = err?.error?.error || 'Impossible de modifier le message.';
      },
    });
  }

  remove(message: LabMessageChat): void {
    if (!this.canDelete(message)) return;
    const ok = window.confirm('Supprimer ce message ? Il restera tracé dans le journal.');
    if (!ok) return;
    this.sending = true;
    this.errorMessage = null;
    this.labService.deleteMessageLab(message.id).subscribe({
      next: () => {
        this.messages = this.messages.filter((m) => m.id !== message.id);
        this.sending = false;
        if (this.editingId === message.id) this.cancelEdit();
      },
      error: (err) => {
        this.sending = false;
        this.errorMessage = err?.error?.error || 'Impossible de supprimer le message.';
      },
    });
  }

  private tagForNewMessage(): { id_evenement?: string; id_diligence?: string } {
    const lockedEvt = this.filterIdEvenement != null ? String(this.filterIdEvenement).trim() : '';
    const lockedDlg = this.filterIdDiligence != null ? String(this.filterIdDiligence).trim() : '';
    if (this.lockFilter) {
      return {
        ...(lockedEvt ? { id_evenement: lockedEvt } : {}),
        ...(lockedDlg ? { id_diligence: lockedDlg } : {}),
      };
    }
    const events = [...this.selectedEventIds];
    const diligences = [...this.selectedDiligenceIds];
    if (diligences.length === 1 && events.length <= 1) {
      return {
        id_diligence: diligences[0],
        ...(events.length === 1 ? { id_evenement: events[0] } : {}),
      };
    }
    if (events.length === 1 && diligences.length === 0) {
      return { id_evenement: events[0] };
    }
    return {};
  }

  private lookupParams(): LabChatParentParams {
    const code = (this.codeClient || '').trim();
    if (this.conversation?.id) {
      return { id_conversation: this.conversation.id, code_client: code };
    }
    return { code_client: code };
  }

  private messageQueryParams(sinceId: number | null): LabChatParentParams & { since_id?: number } {
    const base = this.lookupParams();
    const eventIds = [...this.selectedEventIds];
    const diligenceIds = [...this.selectedDiligenceIds];
    return {
      ...base,
      ...(eventIds.length ? { id_evenement: eventIds.join(',') } : {}),
      ...(diligenceIds.length ? { id_diligence: diligenceIds.join(',') } : {}),
      ...(sinceId != null ? { since_id: sinceId } : {}),
    };
  }

  private syncLockedFilters(): void {
    this.selectedEventIds.clear();
    this.selectedDiligenceIds.clear();
    const evt = this.filterIdEvenement != null ? String(this.filterIdEvenement).trim() : '';
    const dlg = this.filterIdDiligence != null ? String(this.filterIdDiligence).trim() : '';
    if (evt) this.selectedEventIds.add(evt);
    if (dlg) this.selectedDiligenceIds.add(dlg);
  }

  private resetAndLoad(): void {
    this.stopPolling();
    this.conversation = null;
    this.messages = [];
    this.draft = '';
    this.cancelEdit();
    this.errorMessage = null;
    if (!(this.codeClient || '').trim()) return;
    this.loadMe();
    this.loadAll(true);
    this.pollSub = interval(8000).subscribe(() => this.loadAll(false));
  }

  private reloadMessages(showSpinner: boolean): void {
    this.loadSeq += 1;
    this.loadAll(showSpinner);
  }

  private loadMe(): void {
    this.labService.getMeLab().subscribe({
      next: (res) => {
        this.meIsFull = !!res.data?.isFull;
        this.meIdSellsy = res.data?.id_sellsy?.trim() || null;
      },
      error: () => {
        this.meIsFull = false;
        this.meIdSellsy = null;
      },
    });
  }

  private lastMessageId(): number | null {
    if (!this.messages.length) return null;
    return Math.max(...this.messages.map((m) => m.id));
  }

  private mergeMessages(incoming: LabMessageChat[]): boolean {
    if (!incoming.length) return false;
    const byId = new Map(this.messages.map((m) => [m.id, m]));
    let added = false;
    for (const message of incoming) {
      if (!byId.has(message.id)) added = true;
      byId.set(message.id, message);
    }
    this.messages = Array.from(byId.values()).sort((a, b) => a.id - b.id);
    return added;
  }

  private loadAll(showSpinner: boolean): void {
    const seq = ++this.loadSeq;
    if (showSpinner) this.loading = true;
    const parent = this.lookupParams();
    this.labService.getConversationLab(parent).subscribe({
      next: (res) => {
        if (seq !== this.loadSeq) return;
        this.conversation = res.data;
        const sinceId = !showSpinner ? this.lastMessageId() : null;
        this.labService.getMessagesLab(this.messageQueryParams(sinceId)).subscribe({
          next: (msgRes) => {
            if (seq !== this.loadSeq) return;
            const incoming = Array.isArray(msgRes.data) ? msgRes.data : [];
            if (sinceId != null) {
              const added = this.mergeMessages(incoming);
              this.loading = false;
              if (added) this.scrollToBottom();
            } else {
              this.messages = incoming;
              this.loading = false;
              if (showSpinner) this.scrollToBottom();
            }
          },
          error: (err) => {
            if (seq !== this.loadSeq) return;
            this.loading = false;
            if (showSpinner) {
              this.errorMessage = err?.error?.error || 'Impossible de charger les messages.';
            }
          },
        });
      },
      error: (err) => {
        if (seq !== this.loadSeq) return;
        this.loading = false;
        if (showSpinner) {
          this.errorMessage = err?.error?.error || "Impossible d'ouvrir la discussion.";
        }
      },
    });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.threadRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
  }
}
