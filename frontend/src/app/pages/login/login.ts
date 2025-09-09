import { Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { DbService } from '../../services/db-service';

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
    private router: Router
  ) {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      
      // ===== NUMERO DE DOSSIER =====
      code_client: ['', Validators.required],

      // ===== DATE DE CLOTURE =====
      dateFinEx: ['', Validators.required]
    });
  }


  verifDossier() {
    this.db.VerifDossier(this.form.value.code_client, this.form.value.dateFinEx)
    .subscribe({
      next: (res) => {
        localStorage.setItem('token', res.token);
        this.errorMessage = '';
        this.router.navigate(['/formulaire']);
      },
      error: (err) => {
        console.error('Erreur lors de la vérification du dossier :', err);
        this.errorMessage = 'Dossier non trouvé. Veuillez vérifier le numéro de dossier et la date de clôture.';
      }
    });
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      console.log('Formulaire invalide');
      return;
    }
    console.log('Formulaire valide', this.form.value);
    this.verifDossier();
  }
}
