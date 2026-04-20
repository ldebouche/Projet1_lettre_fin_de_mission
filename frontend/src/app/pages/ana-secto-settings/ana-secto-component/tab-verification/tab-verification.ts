import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { switchMap, finalize } from 'rxjs/operators';
import { BoutonFiltreComponent } from '../../../../shared/bouton-filtre/bouton-filtre';

import { AnaSectoMeta, AnaSectoService } from '../../../../services/ana-secto-service';

@Component({
  selector: 'app-ana-tab-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, BoutonFiltreComponent],
  templateUrl: './tab-verification.html'
})
export class AnaTabVerificationComponent implements OnInit {
  recherche = '';
  tri: 'date' | 'nom' = 'date';
  ordre: 'asc' | 'desc' = 'desc';

  fichiers: AnaSectoMeta[] = [];
  selection: AnaSectoMeta | null = null;
  code_ape = '';
  millesime = 0;
  texte = '';

  isLoading = false;
  isSaving = false;

  errors = {
    codeAPE: '',
    millesime: '',
    texte: ''
  };

  @Output() updated = new EventEmitter<void>();

  constructor(
    private anaSectoService: AnaSectoService
  ) { }

  ngOnInit(): void {
    this.loadAnaSecto();
  }

  public reload(): void {
    this.loadAnaSecto();
  }

  loadAnaSecto() {
    this.isLoading = true;
    this.anaSectoService.GetAnaSecto('attente').subscribe((res) => {
      this.fichiers = res.fichiers ?? [];
      this.selection = this.fichiers[0] ?? null;
      this.code_ape = this.selection?.codeAPE ?? '';
      this.millesime = this.selection?.millesime ?? 0;
      this.texte = this.selection?.texte ?? '';
      this.isLoading = false;
    });
  }

  onClickFiltre(): void {
    if (this.ordre === 'desc') {
      this.ordre = 'asc';
    } else {
      this.ordre = 'desc';
      this.tri = this.tri === 'date' ? 'nom' : 'date';
    }
  }

  get fichiersFiltres(): AnaSectoMeta[] {
    const q = this.recherche.trim().toLowerCase();
    let list = [...this.fichiers];

    if (q) {
      list = list.filter(f =>
        f.nomFichier.toLowerCase().includes(q) ||
        f.pdfUrl.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (this.tri === 'nom') {
        const cmp = a.nomFichier.localeCompare(b.nomFichier, 'fr', { sensitivity: 'base' });
        return this.ordre === 'asc' ? cmp : -cmp;
      }
      const da = Date.parse(a.dateCreation);
      const db = Date.parse(b.dateCreation);
      const diff = da - db;
      return this.ordre === 'asc' ? diff : -diff;
    });

    return list;
  }

  selectionner(f: AnaSectoMeta): void {
    this.selection = JSON.parse(JSON.stringify(f));
    this.code_ape = this.selection?.codeAPE ?? '';
    this.millesime = this.selection?.millesime ?? 0;
    this.texte = this.selection?.texte ?? '';
    this.errors = { codeAPE: '', millesime: '', texte: '' };
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  get isModifiable(): boolean {
    if (!this.selection) return false;

    return (
      this.code_ape !== this.selection.codeAPE ||
      this.millesime !== this.selection.millesime ||
      this.texte !== this.selection.texte
    );
  }

  enregistrerModifs(): Observable<any> {
    if (!this.selection) return of(null);

    const changed =
      this.selection.codeAPE !== this.code_ape ||
      this.selection.millesime !== this.millesime ||
      this.selection.texte !== this.texte;

    if (!changed) return of(null);

    const meta = {
      id: this.selection.id,
      nomFichier: this.selection.nomFichier,
      codeAPE: this.code_ape,
      millesime: this.millesime,
      texte: this.texte
    };

    this.isSaving = true;
    return this.anaSectoService.UpdateAnaSecto(meta).pipe(
      finalize(() => (this.isSaving = false))
    );
  }

  saveOnly(): void {
    this.enregistrerModifs().subscribe(() => {
      this.loadAnaSecto();
      this.updated.emit();
    });
  }

  private validate(): boolean {
    this.errors.codeAPE = '';
    this.errors.millesime = '';
    this.errors.texte = '';

    const code = (this.code_ape || '').trim();
    const mil = (this.millesime || '').toString().trim();
    const txt = (this.texte || '').trim();

    let ok = true;

    if (!code) { this.errors.codeAPE = 'Code APE requis'; ok = false; }
    if (!mil || mil === '0') { this.errors.millesime = 'Millésime requis'; ok = false; }
    if (!txt) { this.errors.texte = 'Texte requis'; ok = false; }

    return ok;
  }

  clearError(field: 'codeAPE' | 'millesime' | 'texte') {
    this.errors[field] = '';
  }

  accepter(): void {
    if (!this.selection) return;

    if (!this.validate()) return;

    this.enregistrerModifs()
      .pipe(
        switchMap(() =>
          this.anaSectoService.AccepterAnaSecto({
            id: this.selection?.id,
            nomFichier: this.selection!.nomFichier,
            codeAPE: this.code_ape
          })
        )
      )
      .subscribe(() => {
        this.loadAnaSecto();
        this.updated.emit();
      });
  }

  refuser(): void {
    if (!this.selection) return;

    this.anaSectoService.RejeterAnaSecto(this.selection.nomFichier, this.selection.codeAPE).subscribe(() => {
      this.loadAnaSecto();
      this.updated.emit();
    });
  }

  ouvrirPdf(file: any): void {
    if (!file?.pdfUrl) return;

    const url = `${file.pdfUrl}?t=${Date.now()}`;
    window.open(url, '_blank');
  }
}
