import { Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { DbService } from '../../services/db-service';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    CommonModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  nomEntreprise = localStorage.getItem('nomEntreprise') || '';
  form!: FormGroup;
  errorMessage: string = '';

  constructor(
    private fb: FormBuilder,
    private db: DbService,
    private dataService: DataService,
    private router: Router
  ) {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      
      // ===== NUMERO DE DOSSIER =====
      code_client: [this.dataService.getCodeClient() || '', Validators.required],

      // ===== DATE DE DEBUT DE MISSION =====
      dateDebutEx: ['', Validators.required],

      // ===== DATE DE FIN DE MISSION =====
      dateFinEx: ['', Validators.required]
    });
  }


  verifDossier() {
    this.db.VerifDossier(this.form.value.code_client, this.form.value.dateFinEx, this.form.value.dateDebutEx)
    .subscribe({
      next: (res) => {
        this.dataService.setCodeClient(this.form.value.code_client);
        this.dataService.setDateDebutEx(this.form.value.dateDebutEx);
        
        this.dataService.setNomEntreprise(this.formatNomEntreprise(res.client));
        this.errorMessage = '';
        this.router.navigate(['/accueil']);
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
        this.errorMessage = 'Dossier non trouvé. Veuillez vérifier les informations.';
      }
    });
  }

  formatNomEntreprise(client: any): string {
    const rs = (client.raison_sociale || '').trim();
    const forme = (client.forme_societe || '').trim();

    if (!rs) {
      return `${(client.civilite || '').trim()} ${(client.nom || '').trim()} ${(client.prenom || '').trim()}`.trim();
    }

    if (forme && rs.toUpperCase().startsWith(forme.toUpperCase())) {
      return rs;
    }

    return `${forme} ${rs}`.trim();
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.value.dateDebutEx > this.form.value.dateFinEx) {
      this.errorMessage = 'La date de fin de mission doit suivre la date de debut de mission.';
      return;
    }
    console.log('Formulaire valide', this.form.value);
    this.verifDossier();
  }
}
