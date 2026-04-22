import { Component, EventEmitter, Input, Output, OnChanges, OnInit, ViewEncapsulation, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatbotSettingsService } from '../../../../services/chatbot-settings-service';
import { IndexedItem } from '../../chatbot-settings';

type AllowedRole = 'general' | 'rh' | 'comptable';

@Component({
  selector: 'app-tab-indexation',
  standalone: true,
  templateUrl: './tab-indexation.html',
  styleUrls: ['./tab-indexation.scss'],
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule]
})
export class TabIndexationComponent implements OnChanges, OnInit {
  @Input() iconFichier = 'assets/icons/fichier.png';

  @Input() indexedItems: IndexedItem[] = [];
  @Input() getIndentationForSelect!: (item: IndexedItem) => string;
  @Input() compareFolders!: (a: any | null, b: any | null) => boolean;

  filesToIndex: any[] = [];
  @Output() filesToUploadChange = new EventEmitter<void>();

  @Output() indexed = new EventEmitter<void>();

  @Input() actualiserIndexation = 0;

  @Output() processingStart = new EventEmitter<{ title: string; message: string }>();
  @Output() processingEnd = new EventEmitter<{ title: string; message: string }>();

  targetFolder: any = null;

  private readonly allowedRoles: AllowedRole[] = ['general', 'rh', 'comptable'];

  constructor(private chatbotSettingsService: ChatbotSettingsService) { }

  ngOnInit(): void {
    this.loadIndexer();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['actualiserIndexation']) {
      this.loadIndexer();
    }
  }

  get availableFolders(): IndexedItem[] {
    return (this.indexedItems || []).filter(i => i.isFolder);
  }

  loadIndexer(): void {
    this.chatbotSettingsService.GetProcedures('a_indexer').subscribe({
      next: (data: any) => {
        const procedures = Array.isArray(data?.procedures) ? data.procedures : [];
        this.filesToIndex = procedures.map((p: any) => ({
          nom: p.nom,
          pdfUrl: p.pdfUrl,
          dateCreation: p.dateCreation,
          tailleMo: Number((p.tailleOctets ?? 0) / 1024 / 1024),
          targetFolder: null,
          roles: [],
          rolesOpen: false
        }));
      }
    });
  }

  toggleRoles(file: any): void {
    file.rolesOpen = !file.rolesOpen;
  }

  getRolesLabel(file: any): string {
    const roles: string[] = Array.isArray(file?.roles) ? file.roles : [];
    if (!roles.length) return 'Aucun';
    // Affichage sympa
    return roles
      .map(r => (r === 'general' ? 'Général' : r === 'rh' ? 'RH' : 'Comptable'))
      .join(', ');
  }

  onRoleChange(file: any, role: AllowedRole, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    const current: string[] = Array.isArray(file.roles) ? [...file.roles] : [];
    const set = new Set(current.filter(r => this.allowedRoles.includes(r as any)));

    if (checked) set.add(role);
    else set.delete(role);

    file.roles = Array.from(set);
  }

  removeFile(file: any): void {
    const nom = file?.nom;
    if (!nom) return;

    this.processingStart.emit({
      title: 'Retour en attente',
      message: 'La procédure est en cours de déplacement vers la file d’attente…'
    });

    this.chatbotSettingsService.MoveIndexerToAttente(nom).subscribe({
      next: () => {
        this.loadIndexer();

        this.filesToUploadChange.emit();

        this.processingEnd.emit({
          title: 'Terminé',
          message: 'La procédure est revenue en attente.'
        });
      },
      error: (e) => {
        console.error(e);
        this.processingEnd.emit({
          title: 'Erreur',
          message: 'Impossible de repasser cette procédure en attente.'
        });
      }
    });
  }
  startIndexing(): void {
    if (!this.filesToIndex.length) return;

    this.processingStart.emit({
      title: 'Indexation en cours',
      message: 'Les fichiers sont en cours de traitement. Merci de patienter…'
    });

    const payload = {
      items: this.filesToIndex.map(item => ({
        nom: item.nom,
        targetFolder: item.targetFolder ? JSON.stringify(item.targetFolder) : null,
        roles: Array.isArray(item.roles) ? item.roles : []
      }))
    };

    this.chatbotSettingsService
      .AddFile(payload)
      .subscribe({
        next: () => {
          this.indexed.emit();

          this.processingEnd.emit({
            title: 'Indexation terminée',
            message: 'Les fichiers ont été indexés avec succès.'
          });
        },
        error: () => {
          this.processingEnd.emit({
            title: 'Erreur',
            message: 'Une erreur est survenue lors de l’indexation.'
          });
        }
      });
  }

  ouvrirPdf(file: any): void {
    if (!file?.pdfUrl) return;

    const url = `${file.pdfUrl}?t=${Date.now()}`;
    window.open(url, '_blank');
  }
}
