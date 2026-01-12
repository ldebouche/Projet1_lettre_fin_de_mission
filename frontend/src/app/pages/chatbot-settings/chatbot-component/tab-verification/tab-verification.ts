import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';


import { BoutonFiltreComponent } from '../../../../shared/bouton-filtre/bouton-filtre';
import { ChatbotSettingsService } from '../../../../services/chatbot-settings-service';

interface FichierEnAttente {
  nom: string;
  urlSource: string;
  dateCreation: string;
  tailleMo: number;
  pdfUrl?: string;
  targetFolder?: any;
}

@Component({
  selector: 'app-tab-verification',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    BoutonFiltreComponent
  ],
  templateUrl: './tab-verification.html'
})
export class TabVerificationComponent implements OnInit {

  recherche = '';
  tri: 'date' | 'nom' = 'date';
  ordre: 'asc' | 'desc' = 'desc';

  fichiers: FichierEnAttente[] = [];
  selection: FichierEnAttente | null = null;
  pdfSafeUrl: SafeResourceUrl | null = null;

  isLoading = false;

  @Output() updated = new EventEmitter<void>();


  constructor(
    private chatbotSettingsService: ChatbotSettingsService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadProcedures();
  }

  loadProcedures() {
    this.isLoading = true;
    this.chatbotSettingsService.GetProcedures('attente').subscribe((res: any) => {
      const procedures = Array.isArray(res?.procedures) ? res.procedures : [];

      this.fichiers = procedures.map((p: any) => ({
        nom: p.nom ?? 'Sans nom',
        urlSource: p.urlSource ?? '',
        dateCreation: p.dateCreation,
        tailleMo: Number((p.tailleOctets ?? 0) / 1024 / 1024),
        pdfUrl: p.pdfUrl ?? '',
        targetFolder: p.targetFolder ?? null,
      }));
      this.selection = this.fichiers[0] ?? null;
      this.mettreAJourPreviewPdf();
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

  get fichiersFiltres(): FichierEnAttente[] {
    const q = this.recherche.trim().toLowerCase();
    let list = [...this.fichiers];

    if (q) {
      list = list.filter(f =>
        f.nom.toLowerCase().includes(q) ||
        f.urlSource.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      if (this.tri === 'nom') {
        const cmp = a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
        return this.ordre === 'asc' ? cmp : -cmp;
      }

      const da = Date.parse(a.dateCreation);
      const db = Date.parse(b.dateCreation);
      const diff = da - db;
      return this.ordre === 'asc' ? diff : -diff;
    });

    return list;
  }

  selectionner(f: FichierEnAttente) {
    this.selection = f;
    this.mettreAJourPreviewPdf();
  }

  toggleOrdre() {
    this.ordre = this.ordre === 'asc' ? 'desc' : 'asc';
  }

  accepterProced() {
    if (!this.selection?.nom) return;
    this.chatbotSettingsService.AccepterProcedure(this.selection.nom).subscribe(
      () => {
        this.loadProcedures();
        this.updated.emit();
      }
    );
  }

  simulerRejeter() {
    if (!this.selection) return;
    this.selection = this.fichiersFiltres[0] ?? null;
    this.updated.emit();
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  mettreAJourPreviewPdf(): void {
    if (!this.selection?.pdfUrl) {
      this.pdfSafeUrl = null;
      return;
    }

    const url = `${this.selection.pdfUrl}?t=${Date.now()}`;
    this.pdfSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  ouvrirPdf(): void {
    if (!this.selection?.pdfUrl) return;
    window.open(this.selection.pdfUrl, '_blank');
  }
}
