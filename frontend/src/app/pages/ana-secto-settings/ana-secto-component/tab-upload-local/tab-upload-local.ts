import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AnaSectoService } from '../../../../services/ana-secto-service';

@Component({
  selector: 'app-ana-tab-upload-local',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-upload-local.html'
})
export class AnaTabUploadLocalComponent {
  @Input() iconExportation = 'assets/icons/exportation.png';
  @Input() iconFichier = 'assets/icons/fichier.png';

  @Output() processingStart = new EventEmitter<{ title: string; message: string }>();
  @Output() processingEnd = new EventEmitter<{ title: string; message: string }>();
  @Output() created = new EventEmitter<void>();

  filesToUpload: File[] = [];

  constructor(
    private anaSectoService: AnaSectoService
  ) { }

  onDragOver(event: DragEvent): void { event.preventDefault(); }
  onDragLeave(event: DragEvent): void { event.preventDefault(); }

  onFileSelected(event: any): void {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;
    this.addFiles(Array.from(files));
    event.target.value = '';
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;
    this.addFiles(Array.from(dt.files));
  }

  private addFiles(files: File[]) {
    const existing = new Set(this.filesToUpload.map(f => `${f.name}_${f.size}`));
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith('.pdf')) continue;
      const key = `${f.name}_${f.size}`;
      if (!existing.has(key)) {
        this.filesToUpload.push(f);
        existing.add(key);
      }
    }
  }

  removeFile(file: File) {
    this.filesToUpload = this.filesToUpload.filter(f => f !== file);
  }

  submit(): void {
    if (this.filesToUpload.length === 0) return;

    this.processingStart.emit({
      title: 'Création en cours',
      message: 'Les analyses sectorielles sont en cours de création. Merci de patienter…'
    });

    this.anaSectoService.CreateAnaSectoFromFiles(this.filesToUpload).subscribe({
      next: () => {
        this.processingEnd.emit({
          title: 'Création terminée',
          message: 'Les analyses sectorielles ont été créées avec succès.'
        });
        this.filesToUpload = [];
        this.created.emit();
      },
      error: () => {
        this.processingEnd.emit({
          title: 'Erreur',
          message: 'Une erreur est survenue lors de la création.'
        });
      }
    });
  }
}
