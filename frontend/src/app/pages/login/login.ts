import { Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';


@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  form!: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      
      // ===== NUMERO DE DOSSIER =====
      numeroDossier: [''],

      // ===== DATE DE CLOTURE =====
      dateCloture: ['']
    });
  }

  onSubmit() {
    console.log('Formulaire envoyé :', this.form.value);
  }
}
