import { Component, EventEmitter, Input, Output, OnChanges, OnInit, ViewEncapsulation, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatbotSettingsService } from '../../../../services/chatbot-settings-service';
import { IndexedItem } from '../../chatbot-settings';

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
  @Output() filesToUploadChange = new EventEmitter<File[]>();

  @Output() indexed = new EventEmitter<void>();

  @Input() actualiserIndexation = 0;

  @Output() processingStart = new EventEmitter<{ title: string; message: string }>();
  @Output() processingEnd = new EventEmitter<{ title: string; message: string }>();

  targetFolder: any = null;

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
          targetFolder: null
        }));
      }
    });
  }

  removeFile(file: File): void {
    const next = (this.filesToIndex || []).filter(f => f !== file);
    this.filesToIndex = next;
    this.filesToUploadChange.emit(next);
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
        targetFolder: item.targetFolder ? JSON.stringify(item.targetFolder) : null
      }))
    };

    this.chatbotSettingsService
      .AddFile(payload)
      .subscribe({
        next: () => {
          this.filesToIndex = [];
          this.filesToUploadChange.emit([]);
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
