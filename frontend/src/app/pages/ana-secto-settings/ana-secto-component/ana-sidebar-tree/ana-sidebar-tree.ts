import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoutonFiltreComponent } from '../../../../shared/bouton-filtre/bouton-filtre';
import { ModalComponent } from '../../../../shared/modal/modal';
import { AnaSectoMeta, AnaSectoService } from '../../../../services/ana-secto-service';

type AnalyseInfo = {
  nom: string;
  millesime?: string;
  codeApe?: string;
  commentaire?: string;
  dateAjout?: string;
  dateModification?: string;
  ajoutePar?: string;
  pdfUrl?: string;
};

@Component({
  selector: 'app-ana-sidebar-tree',
  standalone: true,
  imports: [CommonModule, BoutonFiltreComponent, ModalComponent],
  templateUrl: './ana-sidebar-tree.html',
  styleUrl: './ana-sidebar-tree.scss',
})
export class AnaSidebarTreeComponent {
  @Input() indexedItems: AnaSectoMeta[] = [];
  @Input() dateSortOrder: 'asc' | 'desc' = 'desc';
  @Input() iconDossier = '/assets/icons/dossier.png';
  @Input() iconFichier = '/assets/icons/fichier.png';

  // ✅ on garde les mêmes outputs que chatbot
  @Output() deleteItem = new EventEmitter<AnaSectoMeta>();
  @Output() toggleFolder = new EventEmitter<AnaSectoMeta>();
  @Output() toggleSortByDate = new EventEmitter<void>();
  @Output() openSearch = new EventEmitter<void>();
  @Output() editItem = new EventEmitter<AnaSectoMeta>();

  @Input() isItemVisibleFn!: (item: AnaSectoMeta) => boolean;
  @Input() getItemDepthFn!: (item: AnaSectoMeta) => number;
  @Input() hasChildrenFn!: (folder: AnaSectoMeta) => boolean;

  @Input() loading = false;

  // Modale infos
  isInfoModalOpen = false;
  info: AnalyseInfo | null = null;

  constructor(
    private anaSectoService: AnaSectoService
  ) { }

  classesItem(item: any): string[] {
    const classes = ['depth-' + this.getItemDepthFn(item)];
    if (item?.isFolder) classes.push('is-folder');
    if (item?.isExpanded) classes.push('is-expanded');
    return classes;
  }

  getSortLabel(): string {
    return 'Date';
  }

  demanderSuppression(item: AnaSectoMeta) {
    this.deleteItem.emit(item);
  }

  demanderToggle(item: AnaSectoMeta) {
    this.toggleFolder.emit(item);
  }

  ouvrirRecherche() {
    this.openSearch.emit();
  }

  demanderEdition(item: AnaSectoMeta) {
    this.editItem.emit(item);
  }

  // ✅ clic ligne: dossier => toggle ; fichier => modale infos
  onClickRow(item: AnaSectoMeta, ev?: MouseEvent) {
    ev?.stopPropagation();
    if (!item) return;

    if (item.isFolder) {
      this.demanderToggle(item);
      return;
    }

    this.openInfoModal(item);
  }

  openInfoModal(item: AnaSectoMeta) {
    this.info = {
      nom: item.nomFichier || '—',
      codeApe: item.codeAPE || '—',
      millesime: item.millesime ? String(item.millesime).replace(/\s+/g, '') : '—',
      commentaire: item.texte || '—',
      dateAjout: item.dateCreation ? new Date(item.dateCreation).toLocaleString('fr-FR') : '—',
      dateModification: item.dateModification ? new Date(item.dateModification).toLocaleString('fr-FR') : '—',
      ajoutePar: item.creePar || '—',
      pdfUrl: item.pdfUrl
    };

    this.isInfoModalOpen = true;
  }

  closeInfoModal() {
    this.isInfoModalOpen = false;
    this.info = null;
  }

  ouvrirPdf() {
    if (!this.info?.pdfUrl) return;
    window.open(`${this.info.pdfUrl}?t=${Date.now()}`, '_blank');
  }
}
