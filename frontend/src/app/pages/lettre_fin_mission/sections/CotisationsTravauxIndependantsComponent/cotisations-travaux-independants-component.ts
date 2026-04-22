import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PdfService } from '../../../../services/pdf-service';
import { FormatService } from '../../../../services/format-service';

@Component({
  selector: 'section-cotisations-travaux-independants-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './cotisations-travaux-independants-component.html',
  styleUrl: './cotisations-travaux-independants-component.scss'
})
export class CotisationsTravauxIndependantsComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() cotisationTravIndep: boolean = false;

  selectedFile: File | null = null;
  fileUrl: string | null = null;

  data: any[] = [];

  tabComplet: any = {};
  tabPartiel: any = {};
  errorMessage: string = '';

  constructor(
    private pdf: PdfService,
    private format: FormatService
  ) {}

  ngOnInit() {
    if (!this.group) return;
  }
  
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (file.type !== 'application/pdf') {
        alert('Veuillez sélectionner un fichier PDF.');
        return;
      }

      this.selectedFile = file;
      this.fileUrl = URL.createObjectURL(file);

      this.pdf.getEcheancier(file).subscribe({
        next: (res) => {
          if (!res.length) { 
            this.errorMessage = 'Aucun contenu extrait';
            return;
          }
          this.tabComplet = res[0];
          this.tabPartiel = res[1];
          
          const annexe1TNS = this.format.formatCP(res[0]);
          const annexe2TNS = this.format.formatCP(res[1]);
          
          this.group.get('annexe1TNS')?.setValue(annexe1TNS);
          this.group.get('annexe2TNS')?.setValue(annexe2TNS);
        },
        error: (err) => console.error('Erreur :', err)
      });
    }
  }

  openSelectedFile() {
    if (this.fileUrl) {
      window.open(this.fileUrl, '_blank');
    }
  }

  removeSelectedFile() {
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
    }
    this.selectedFile = null;
    this.fileUrl = null;
  }
}
