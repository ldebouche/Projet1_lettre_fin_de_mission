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
      code_client: ['', Validators.required],

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
        localStorage.setItem('token', res.token);
        this.dataService.setCodeClient(this.form.value.code_client);
        this.dataService.setDateDebutEx(this.form.value.dateDebutEx);
        this.errorMessage = '';
        this.router.navigate(['/accueil']);
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
        this.errorMessage = 'Dossier non trouvé. Veuillez vérifier les informations.';
      }
    });
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
