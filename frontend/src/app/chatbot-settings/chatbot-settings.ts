import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatbotSettingsService } from '../services/chatbot-settings-service';

interface IndexedItem {
  id: number;
  name: string;
  isFolder: boolean;
  parentId: number | null;
  isExpanded?: boolean;
  url?: string;
}

interface ModalConfig {
  type: 'alert' | 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  onConfirm: (value?: any) => void;
}

@Component({
  selector: 'app-chatbot-settings',
  templateUrl: './chatbot-settings.html',
  styleUrls: ['./chatbot-settings.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ChatbotSettingsComponent implements OnInit {
  iconDossier = '/assets/icons/dossier.png';
  iconFichier = 'assets/icons/fichier.png';
  iconExportation = 'assets/icons/exportation.png';

  filesToUpload: any[] = [];

  indexedItems: IndexedItem[] = [];

  isModalOpen = false;
  isIndexing = false;
  indexingDone = false;
  modalConfig!: ModalConfig;
  modalInputValue = '';
  private depthCache = new Map<number, number>();
  targetFolder: any = null;

  constructor(
    private chatbotSettingsService: ChatbotSettingsService
  ) { }

  ngOnInit(): void {
    this.depthCache.clear();
    this.getTree();
  }

  get availableFolders(): IndexedItem[] {
    return this.indexedItems.filter(item => item.isFolder);
  }

  hasChildren(folder: IndexedItem): boolean {
    return this.indexedItems.some(item => item.parentId === folder.id);
  }

  getTree(): void {
    this.depthCache.clear();
    const expandedFolderIds = new Set(
      this.indexedItems.filter(item => item.isFolder && item.isExpanded).map(item => item.id)
    );
    this.chatbotSettingsService.GetTree().subscribe((data: any) => {
      const newItems = data.map((item: IndexedItem) => {
        if (item.isFolder && expandedFolderIds.has(item.id)) {
          item.isExpanded = true;
        }
        return item;
      });
      this.indexedItems = newItems;
    });
  }

  onFileSelected(event: any): void {
    const files: FileList = event.target.files;
    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.filesToUpload.push(file);
      }
    }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const dataTransfer = event.dataTransfer;
    if (dataTransfer && dataTransfer.files.length > 0) {
      const files = dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.filesToUpload.push(file);
      }
    }
  }

  removeFile(file: any): void {
    this.filesToUpload = this.filesToUpload.filter((f: any) => f !== file);
  }

  startIndexing(): void {
    if (this.filesToUpload.length === 0) return;

    this.isIndexing = true;
    this.indexingDone = false;

    this.openModal({
      type: 'alert',
      title: 'Indexation en cours',
      message: 'Les fichiers sont en cours de traitement. Merci de patienter…',
      onConfirm: () => {}
    });

    this.chatbotSettingsService
      .AddFile(this.filesToUpload, this.targetFolder)
      .subscribe({
        next: () => {
          this.getTree();
          this.filesToUpload = [];

          this.isIndexing = false;
          this.indexingDone = true;

          this.modalConfig = {
            type: 'alert',
            title: 'Indexation terminée',
            message: 'Les fichiers ont été indexés avec succès.',
            cancelButtonText: 'Fermer',
            onConfirm: () => this.closeModal()
          };
        },
        error: () => {
          this.isIndexing = false;
          this.indexingDone = true;

          this.modalConfig = {
            type: 'alert',
            title: 'Erreur',
            message: 'Une erreur est survenue lors de l’indexation.',
            cancelButtonText: 'Fermer',
            onConfirm: () => this.closeModal()
          };
        }
      });
  }

  confirmDelete(item: IndexedItem): void {
    const confirmMsg = item.isFolder
      ? `Êtes-vous sûr de vouloir supprimer le dossier "${item.name}" et son contenu ?`
      : `Êtes-vous sûr de vouloir supprimer le fichier "${item.name}" de la base de connaissances ?`;

    this.openModal({
      type: 'confirm',
      title: 'Confirmation de suppression',
      message: confirmMsg,
      confirmButtonText: 'Supprimer',
      onConfirm: () => {
        this.chatbotSettingsService.DeleteItem(item, this.indexedItems).subscribe(() => {
          this.getTree();
        });
      }
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
  }

  createNewFolder(parentId: number | null = null): void {
    this.openModal({
      type: 'prompt',
      title: 'Créer un nouveau dossier',
      message: 'Entrez le nom du nouveau dossier :',
      confirmButtonText: 'Créer',
      onConfirm: (folderName: string) => {
        this.chatbotSettingsService.CreateFolder(folderName, parentId, this.indexedItems).subscribe(() => {
          this.getTree();
        });
      }
    });
  }

  toggleFolder(folder: IndexedItem): void {
    if (folder.isFolder) {
      folder.isExpanded = !folder.isExpanded;
    }
  }

  isItemVisible(item: IndexedItem): boolean {
    if (item.parentId === null) {
      return true; // Les éléments à la racine sont toujours visibles
    }

    const parent = this.indexedItems.find(p => p.id === item.parentId);
    if (!parent) {
      return true; // Orphelin, on l'affiche par sécurité
    }

    return parent.isExpanded ? this.isItemVisible(parent) : false;
  }

  getItemDepth(item: IndexedItem): number {
    if (this.depthCache.has(item.id)) {
      return this.depthCache.get(item.id)!;
    }

    if (item.parentId === null) {
      this.depthCache.set(item.id, 0);
      return 0;
    }

    const parent = this.indexedItems.find(p => p.id === item.parentId);
    const depth = parent ? 1 + this.getItemDepth(parent) : 0;

    this.depthCache.set(item.id, depth);
    return depth;
  }

  getIndentationForSelect(item: IndexedItem): string {
    const depth = this.getItemDepth(item);
    const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(depth);
    return `${indent}↳ `;
  }

  compareFolders(a: any | null, b: any | null): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return a.path === b.path;
  }

  openModal(config: ModalConfig): void {
    this.modalConfig = config;
    this.modalInputValue = '';
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  confirmModal(): void {
    if (this.modalConfig.type === 'prompt' && !this.modalInputValue.trim()) {
      return; // Ne rien faire si le champ est vide pour un prompt
    }
    this.modalConfig.onConfirm(this.modalInputValue);
    this.closeModal();
  }
}