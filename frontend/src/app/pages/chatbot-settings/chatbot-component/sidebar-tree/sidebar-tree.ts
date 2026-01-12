import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoutonFiltreComponent } from '../../../../shared/bouton-filtre/bouton-filtre';
import { IndexedItem } from '../../chatbot-settings';

@Component({
  selector: 'app-sidebar-tree',
  standalone: true,
  imports: [CommonModule, BoutonFiltreComponent],
  templateUrl: './sidebar-tree.html'
})
export class SidebarTreeComponent {
  @Input() indexedItems: IndexedItem[] = [];
  @Input() dateSortOrder: 'asc' | 'desc' = 'desc';
  @Input() iconDossier = '/assets/icons/dossier.png';
  @Input() iconFichier = '/assets/icons/fichier.png';

  @Output() createFolder = new EventEmitter<number | null>();
  @Output() deleteItem = new EventEmitter<IndexedItem>();
  @Output() toggleFolder = new EventEmitter<IndexedItem>();
  @Output() toggleSortByDate = new EventEmitter<void>();


  private depthCache = new Map<number, number>();

  @Input() isItemVisibleFn!: (item: IndexedItem) => boolean;
  @Input() getItemDepthFn!: (item: IndexedItem) => number;
  @Input() hasChildrenFn!: (folder: IndexedItem) => boolean;

  @Input() loading = false;

  classesItem(item: any): string[] {
    const classes = ['depth-' + this.getItemDepthFn(item)];
    if (item?.isFolder) classes.push('is-folder');
    if (item?.isExpanded) classes.push('is-expanded');
    return classes;
  }

  getSortLabel(): string {
    return 'Date';
  }

  demanderCreationRacine() {
    this.createFolder.emit(null);
  }

  demanderCreationSousDossier(id: number) {
    this.createFolder.emit(id);
  }

  demanderSuppression(item: IndexedItem) {
    this.deleteItem.emit(item);
  }

  demanderToggle(item: IndexedItem) {
    this.toggleFolder.emit(item);
  }

  ouvrirPdf(item: IndexedItem, ev?: MouseEvent): void {
    ev?.stopPropagation();

    if (!item || item.isFolder) return;

    const url = item.url;
    if (!url) return;

    window.open(`${url}?t=${Date.now()}`, '_blank');
  }
}
