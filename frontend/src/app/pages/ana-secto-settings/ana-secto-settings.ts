import { Component, OnInit, ViewEncapsulation, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AnaSidebarTreeComponent } from './ana-secto-component/ana-sidebar-tree/ana-sidebar-tree';
import { AnaTabUploadLocalComponent } from './ana-secto-component/tab-upload-local/tab-upload-local';
import { AnaTabVerificationComponent } from './ana-secto-component/tab-verification/tab-verification';
import { ModalComponent } from '../../shared/modal/modal';

import { AnaSectoMeta, AnaSectoService } from '../../services/ana-secto-service';

interface ModalConfig {
  type: 'alert' | 'confirm' | 'prompt' | 'search';
  title: string;
  message?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  onConfirm: (value?: any) => void;
}

@Component({
  selector: 'app-ana-secto-settings',
  templateUrl: './ana-secto-settings.html',
  styleUrls: ['./ana-secto-settings.scss'],
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    AnaSidebarTreeComponent,
    AnaTabUploadLocalComponent,
    AnaTabVerificationComponent,
    ModalComponent
  ],
})
export class AnaSectorielleSettingsComponent implements OnInit {
  @ViewChild(AnaTabVerificationComponent) verifComp!: AnaTabVerificationComponent;
  iconDossier = '/assets/icons/dossier.png';
  iconFichier = 'assets/icons/fichier.png';
  iconExportation = 'assets/icons/exportation.png';

  activeTab: 'upload' | 'verif' = 'upload';

  indexedItems: AnaSectoMeta[] = [];
  loading_tree = false;
  dateSortOrder: 'asc' | 'desc' = 'desc';

  compteurFichiersVerif = 0;

  isModalOpen = false;
  modalConfig!: ModalConfig;
  modalInputValue = '';
  isProcessing = false;

  anaSectoSearch = false;
  searchQuery = '';
  searchResults: AnaSectoMeta[] = [];

  private depthCache = new Map<number, number>();

  constructor(
    private anaSectoService: AnaSectoService
  ) { }

  ngOnInit(): void {
    this.depthCache.clear();
    this.loadTree();
    this.getCompteursFichiers();
  }

  getCompteursFichiers(): void {
    this.anaSectoService.GetCompteurFichiers().subscribe({
      next: (data: any) => {
        this.compteurFichiersVerif = data.compteur ?? 0;
      },
      error: () => {
        this.compteurFichiersVerif = 0;
      }
    });
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

  // ===== Sidebar Tree helpers (copié de chatbot-settings) =====
  hasChildren(folder: AnaSectoMeta): boolean {
    return this.indexedItems.some(item => item.idParent === folder.id);
  }

  toggleFolder(folder: AnaSectoMeta): void {
    if (folder.isFolder) folder.isExpanded = !folder.isExpanded;
  }

  isItemVisible(item: AnaSectoMeta): boolean {
    if (item.idParent === null) return true;
    const parent = this.indexedItems.find(p => p.id === item.idParent);
    if (!parent) return true;
    return parent.isExpanded ? this.isItemVisible(parent) : false;
  }

  getItemDepth(item: AnaSectoMeta): number {
    if (this.depthCache.has(item.id)) return this.depthCache.get(item.id)!;

    if (item.idParent === null) {
      this.depthCache.set(item.id, 0);
      return 0;
    }

    const parent = this.indexedItems.find(p => p.id === item.idParent);
    const depth = parent ? 1 + this.getItemDepth(parent) : 0;

    this.depthCache.set(item.id, depth);
    return depth;
  }

  toggleSortByDate(): void {
    this.dateSortOrder = this.dateSortOrder === 'asc' ? 'desc' : 'asc';
    this.indexedItems = this.sortTreeByImportedAt(this.indexedItems, this.dateSortOrder);
    this.depthCache.clear();
  }

  setTab(tab: 'upload' | 'verif'): void {
    this.activeTab = tab;
    this.getCompteursFichiers();
  }

  // ===== Events venant de la vérif =====
  onVerificationUpdated() {
    this.getCompteursFichiers();
    this.loadTree(); // pour simuler le move attente -> indexé
  }

  private loadTree() {
    this.loading_tree = true;
    this.depthCache.clear();

    this.anaSectoService.GetTree().subscribe((data: any) => {
      this.indexedItems = this.sortTreeByImportedAt(data, this.dateSortOrder);
      this.getCompteursFichiers();
      console.log(data);
      this.loading_tree = false;
    });
  }

  private sortTreeByImportedAt(items: AnaSectoMeta[], order: 'asc' | 'desc'): AnaSectoMeta[] {
    const children = new Map<number | null, AnaSectoMeta[]>();
    for (const it of items) {
      const k = it.idParent ?? null;
      if (!children.has(k)) children.set(k, []);
      children.get(k)!.push(it);
    }

    const time = (v?: string | null) => {
      if (!v) return null;
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    };

    const eff = new Map<number, number | null>();

    const effectiveTime = (it: AnaSectoMeta): number | null => {
      if (eff.has(it.id)) return eff.get(it.id)!;
      let best = it.isFolder ? null : time(it.dateCreation);
      for (const ch of (children.get(it.id) ?? [])) {
        const t = effectiveTime(ch);
        if (t !== null) best = best === null ? t : Math.max(best, t);
      }
      eff.set(it.id, best);
      return best;
    };

    const cmp = (a: AnaSectoMeta, b: AnaSectoMeta) => {
      const ta = effectiveTime(a);
      const tb = effectiveTime(b);

      if (ta === null && tb !== null) return 1;
      if (ta !== null && tb === null) return -1;

      if (ta === null && tb === null) {
        return a.nomFichier.localeCompare(b.nomFichier, 'fr', { sensitivity: 'base' });
      }

      const diff = ta! - tb!;
      if (diff !== 0) return order === 'asc' ? diff : -diff;

      return a.nomFichier.localeCompare(b.nomFichier, 'fr', { sensitivity: 'base' });
    };

    for (const [k, arr] of children.entries()) {
      arr.sort(cmp);
      children.set(k, arr);
    }

    const out: AnaSectoMeta[] = [];
    const walk = (pid: number | null) => {
      for (const it of (children.get(pid) ?? [])) {
        out.push(it);
        if (it.isFolder) walk(it.id);
      }
    };
    walk(null);

    return out;
  }

  confirmDelete(item: AnaSectoMeta): void {
    const confirmMsg = item.isFolder
      ? `Êtes-vous sûr de vouloir supprimer le dossier "${item.nomFichier}" et son contenu ?`
      : `Êtes-vous sûr de vouloir supprimer le fichier "${item.nomFichier}" de la base de connaissances ?`;

    this.openModal({
      type: 'confirm',
      title: 'Confirmation de suppression',
      message: confirmMsg,
      confirmButtonText: 'Supprimer',
      onConfirm: () => {
        this.anaSectoService.DeleteItem(item).subscribe(() => {
          this.loadTree();
          this.getCompteursFichiers();
        });
      }
    });
  }

  confirmEdit(item: AnaSectoMeta): void {
    this.openModal({
      type: 'confirm',
      title: 'Passer en édition',
      message: 'Ce fichier va repasser en attente et sera retiré de la base de connaissances.',
      confirmButtonText: 'Passer en attente',
      cancelButtonText: 'Annuler',
      onConfirm: () => {
        this.anaSectoService.EditFromTree(item).subscribe(() => {
          this.loadTree();
          this.getCompteursFichiers();
          this.activeTab = 'verif';
          queueMicrotask(() => this.verifComp?.reload());
        });
      }
    });
  }

  private getIndexedPdfFiles(): AnaSectoMeta[] {
    return (this.indexedItems || [])
      .filter(i => !i.isFolder)
      .filter(i => (i.nomFichier || '').toLowerCase().endsWith('.pdf'));
  }

  openSearchModal(): void {
    this.anaSectoSearch = true;
    this.searchQuery = '';
    this.updateSearchResults();

    this.openModal({
      type: 'search',
      title: 'Rechercher une analyse sectorielle',
      confirmButtonText: 'Fermer',
      onConfirm: () => this.closeModal()
    });

    this.modalInputValue = '';
  }

  updateSearchResults(): void {
    const files = this.getIndexedPdfFiles();
    const q = this.searchQuery.trim().toLowerCase();

    this.searchResults = !q
      ? files.slice(0, 50)
      : files
        .filter(f => {
          const nom = (f.nomFichier || '').toLowerCase();
          const ape = (String((f as any).codeAPE ?? '')).toLowerCase();
          const mil = (String((f as any).millesime ?? '')).toLowerCase();

          return (
            nom.includes(q) ||
            ape.includes(q) ||
            mil.includes(q)
          );
        })
        .slice(0, 100);
  }

  openFileFromSearch(item: AnaSectoMeta): void {
    if (!item?.pdfUrl) return;
    window.open(`${item.pdfUrl}?t=${Date.now()}`, '_blank');
  }
}
