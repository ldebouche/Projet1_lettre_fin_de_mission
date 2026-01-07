import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatbotSettingsService } from '../../services/chatbot-settings-service';
import { ModalComponent } from '../../shared/modal/modal';
import { BoutonFiltreComponent } from '../../shared/bouton-filtre/bouton-filtre';

interface IndexedItem {
  id: number;
  name: string;
  isFolder: boolean;
  parentId: number | null;
  isExpanded?: boolean;
  url?: string;
  importedAt?: string | null;
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
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    BoutonFiltreComponent
  ]
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
  dateSortOrder: 'asc' | 'desc' = 'desc';
  activeTab: 'upload' | 'link' = 'upload';
  externalLink: string = '';

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
      this.indexedItems = this.sortTreeByImportedAt(newItems, this.dateSortOrder);
    });
  }

  private sortTreeByImportedAt(items: IndexedItem[], order: 'asc' | 'desc'): IndexedItem[] {
    // enfants par parent
    const children = new Map<number | null, IndexedItem[]>();
    for (const it of items) {
      const k = it.parentId ?? null;
      if (!children.has(k)) children.set(k, []);
      children.get(k)!.push(it);
    }

    const time = (v?: string | null) => {
      if (!v) return null;
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    };

    // date “effective” (fichier: importedAt, dossier: max descendants)
    const eff = new Map<number, number | null>();

    const effectiveTime = (it: IndexedItem): number | null => {
      if (eff.has(it.id)) return eff.get(it.id)!;

      let best = it.isFolder ? null : time(it.importedAt);
      for (const ch of (children.get(it.id) ?? [])) {
        const t = effectiveTime(ch);
        if (t !== null) best = best === null ? t : Math.max(best, t);
      }
      eff.set(it.id, best);
      return best;
    };

    const cmp = (a: IndexedItem, b: IndexedItem) => {
      const ta = effectiveTime(a);
      const tb = effectiveTime(b);

      // ✅ les éléments “vides” (ta/tb null) vont à la fin
      if (ta === null && tb !== null) return 1;
      if (ta !== null && tb === null) return -1;

      // si tous les deux vides => alpha
      if (ta === null && tb === null) {
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      }

      // tri date
      const diff = ta! - tb!;
      if (diff !== 0) return order === 'asc' ? diff : -diff;

      // égalité => alpha
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    };

    // trier les enfants de chaque parent
    for (const [k, arr] of children.entries()) {
      arr.sort(cmp);
      children.set(k, arr);
    }

    // rebuild flat list
    const out: IndexedItem[] = [];
    const walk = (pid: number | null) => {
      for (const it of (children.get(pid) ?? [])) {
        out.push(it);
        if (it.isFolder) walk(it.id);
      }
    };
    walk(null);

    return out;
  }


  setTab(tab: 'upload' | 'link'): void {
    this.activeTab = tab;
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

  addExternalLink(): void {
    if (!this.externalLink) return;

    this.isIndexing = true;
    this.indexingDone = false;

    this.openModal({
      type: 'alert',
      title: 'Création en cours',
      message: 'La procédure est en cours de création. Merci de patienter…',
      onConfirm: () => { }
    });

    // A modifier pour ajouter le fichier pdf créé par le lien externe, le fichier devra être téléchargeable et visualisable par la personne
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
            title: 'Création terminée',
            message: 'La procédure a été crée avec succès.',
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
            message: 'Une erreur est survenue lors de la création.',
            cancelButtonText: 'Fermer',
            onConfirm: () => this.closeModal()
          };
        }
      });
  }

  startIndexing(): void {
    if (this.filesToUpload.length === 0) return;

    this.isIndexing = true;
    this.indexingDone = false;

    this.openModal({
      type: 'alert',
      title: 'Indexation en cours',
      message: 'Les fichiers sont en cours de traitement. Merci de patienter…',
      onConfirm: () => { }
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

  toggleSortByDate(): void {
    this.dateSortOrder = this.dateSortOrder === 'asc' ? 'desc' : 'asc';
    this.indexedItems = this.sortTreeByImportedAt(this.indexedItems, this.dateSortOrder);
    this.depthCache.clear();
  }

  getSortLabel(): string {
    return 'Date';
  }
}