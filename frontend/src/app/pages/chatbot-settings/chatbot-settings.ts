import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatbotSettingsService } from '../../services/chatbot-settings-service';
import { ModalComponent } from '../../shared/modal/modal';

import { SidebarTreeComponent } from './chatbot-component/sidebar-tree/sidebar-tree';
import { TabUploadLocalComponent } from './chatbot-component/tab-upload-local/tab-upload-local';
import { TabLienExterneComponent } from './chatbot-component/tab-lien-externe/tab-lien-externe';
import { TabVerificationComponent } from './chatbot-component/tab-verification/tab-verification';
import { TabIndexationComponent } from './chatbot-component/tab-indexation/tab-indexation';

export interface IndexedItem {
  id: number;
  name: string;
  isFolder: boolean;
  parentId: number | null;
  isExpanded?: boolean;
  url?: string;
  importedAt?: string | null;
  filePath?: string | null;
}

interface ModalConfig {
  type: 'alert' | 'confirm' | 'prompt' | 'search';
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
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    SidebarTreeComponent,
    TabUploadLocalComponent,
    TabLienExterneComponent,
    TabVerificationComponent,
    TabIndexationComponent
  ]
})
export class ChatbotSettingsComponent implements OnInit {
  iconDossier = '/assets/icons/dossier.png';
  iconFichier = 'assets/icons/fichier.png';
  iconExportation = 'assets/icons/exportation.png';

  filesToUpload: File[] = [];
  indexedItems: IndexedItem[] = [];

  isModalOpen = false;
  isProcessing = false;
  modalConfig!: ModalConfig;
  modalInputValue = '';
  private depthCache = new Map<number, number>();

  dateSortOrder: 'asc' | 'desc' = 'desc';
  activeTab: 'upload' | 'link' | 'verif' | 'index' = 'upload';

  loading_tree = false;

  compteurFichiersVerif = 0;
  compteurFichiersIndex = 0;

  actualiserIndexation = 0;

  searchQuery = '';
  searchResults: IndexedItem[] = [];

  constructor(private chatbotSettingsService: ChatbotSettingsService) { }

  ngOnInit(): void {
    this.depthCache.clear();
    this.getTree();
    this.getCompteursFichiers();
  }

  get availableFolders(): IndexedItem[] {
    return this.indexedItems.filter(item => item.isFolder);
  }

  hasChildren(folder: IndexedItem): boolean {
    return this.indexedItems.some(item => item.parentId === folder.id);
  }

  getTree(): void {
    this.loading_tree = true;
    this.depthCache.clear();

    const expandedFolderIds = new Set(
      this.indexedItems.filter(i => i.isFolder && i.isExpanded).map(i => i.id)
    );

    this.chatbotSettingsService.GetTree().subscribe((data: any) => {
      const newItems = data.map((item: IndexedItem) => {
        if (item.isFolder && expandedFolderIds.has(item.id)) item.isExpanded = true;
        return item;
      });

      this.indexedItems = this.sortTreeByImportedAt(newItems, this.dateSortOrder);
      this.getCompteursFichiers();

      this.loading_tree = false;
    });
  }

  private sortTreeByImportedAt(items: IndexedItem[], order: 'asc' | 'desc'): IndexedItem[] {
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

      if (ta === null && tb !== null) return 1;
      if (ta !== null && tb === null) return -1;

      if (ta === null && tb === null) {
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      }

      const diff = ta! - tb!;
      if (diff !== 0) return order === 'asc' ? diff : -diff;

      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    };

    for (const [k, arr] of children.entries()) {
      arr.sort(cmp);
      children.set(k, arr);
    }

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

  toggleFolder(folder: IndexedItem): void {
    if (folder.isFolder) folder.isExpanded = !folder.isExpanded;
  }

  isItemVisible(item: IndexedItem): boolean {
    if (item.parentId === null) return true;
    const parent = this.indexedItems.find(p => p.id === item.parentId);
    if (!parent) return true;
    return parent.isExpanded ? this.isItemVisible(parent) : false;
  }

  getItemDepth(item: IndexedItem): number {
    if (this.depthCache.has(item.id)) return this.depthCache.get(item.id)!;

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

  createNewFolder(parentId: number | null = null): void {
    this.openModal({
      type: 'prompt',
      title: 'Créer un nouveau dossier',
      message: 'Entrez le nom du nouveau dossier :',
      confirmButtonText: 'Créer',
      onConfirm: (folderName: string) => {
        this.chatbotSettingsService.CreateFolder(folderName, parentId, this.indexedItems).subscribe(() => {
          this.getTree();
          this.getCompteursFichiers();
        });
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
          this.getCompteursFichiers();
        });
      }
    });
  }

  toggleSortByDate(): void {
    this.dateSortOrder = this.dateSortOrder === 'asc' ? 'desc' : 'asc';
    this.indexedItems = this.sortTreeByImportedAt(this.indexedItems, this.dateSortOrder);
    this.depthCache.clear();
  }

  getSortLabel(): string {
    return 'Date';
  }

  setTab(tab: 'upload' | 'link' | 'verif' | 'index'): void {
    this.activeTab = tab;
    this.getCompteursFichiers();
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
    if (this.modalConfig.type === 'prompt' && !this.modalInputValue.trim()) return;
    this.modalConfig.onConfirm(this.modalInputValue);
    this.closeModal();
  }

  startProcessing(title: string, message: string) {
    this.isProcessing = true;
    this.openModal({
      type: 'alert',
      title,
      message,
      cancelButtonText: 'Fermer',
      onConfirm: () => { }
    });
  }

  endProcessing(title: string, message: string) {
    this.isProcessing = false;

    if (!this.isModalOpen) this.isModalOpen = true;

    this.modalConfig = {
      type: 'alert',
      title,
      message,
      cancelButtonText: 'Fermer',
      onConfirm: () => this.closeModal()
    };
  }

  getCompteursFichiers() {
    this.chatbotSettingsService.GetCompteurFichiers().subscribe({
      next: (data: any) => {
        this.compteurFichiersVerif = data.compteur.verif ?? 0;
        this.compteurFichiersIndex = data.compteur.index ?? 0;
      },
      error: () => {
        this.compteurFichiersVerif = 0;
        this.compteurFichiersIndex = 0;
      }
    });
  }

  onVerificationUpdated() {
    this.getCompteursFichiers();
    this.actualiserIndexation++;
  }

  openSearchModal(): void {
    this.searchQuery = '';
    this.updateSearchResults();

    this.openModal({
      type: 'search',
      title: 'Rechercher un fichier',
      confirmButtonText: 'Fermer',
      onConfirm: () => this.closeModal()
    });

    this.modalInputValue = '';
    setTimeout(() => {
    });
  }

  private getChatbotFiles(): IndexedItem[] {
    return (this.indexedItems || [])
      .filter(i => !i.isFolder)
      .filter(i => (i.filePath || '').toLowerCase().includes('\\documents\\chatbot\\'));
  }

  updateSearchResults(): void {
    const files = this.getChatbotFiles();
    const q = this.searchQuery.trim().toLowerCase();

    const formatFr = (iso?: any) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';

      const fr = d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });

      const frLoose = fr.replace(/^0/, '').replace('/0', '/');

      return `${fr} ${frLoose}`;
    };

    this.searchResults = !q
      ? files.slice(0, 50)
      : files
        .filter(f => {
          const name = (f.name || '').toLowerCase();
          const iso = (f.importedAt || '').toLowerCase();
          const fr = formatFr(f.importedAt).toLowerCase();

          return name.includes(q) || iso.includes(q) || fr.includes(q);
        })
        .slice(0, 100);
  }

  openFileFromSearch(item: IndexedItem): void {
    if (!item?.url) return;
    window.open(`${item.url}?t=${Date.now()}`, '_blank');
  }
}
