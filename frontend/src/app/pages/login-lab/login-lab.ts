import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal/modal';
import { Router } from '@angular/router';

type Entreprise = {
  siret: string;
  nom: string;
  adresse: string;
};

@Component({
  selector: 'app-login-lab',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalComponent],
  templateUrl: './login-lab.html',
  styleUrls: ['./login-lab.scss'],
})
export class LoginLabComponent {
  form: FormGroup;

  errorMessage = '';
  isResultModalOpen = false;
  entrepriseTrouvee: Entreprise | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router
  ) {
    this.form = this.fb.group({
      siret: ['', [Validators.required, Validators.pattern(/^\d{14}$/)]],
    });
  }

  onSearch() {
    this.errorMessage = '';
    this.entrepriseTrouvee = null;

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const siretCtrl = this.form.get('siret');
      if (siretCtrl?.errors?.['required']) this.errorMessage = 'Le SIRET est requis.';
      else if (siretCtrl?.errors?.['pattern']) this.errorMessage = 'Le SIRET doit contenir 14 chiffres.';
      else this.errorMessage = 'Saisie invalide.';
      return;
    }

    const siret = String(this.form.value.siret).replace(/\s+/g, '');

    // ✅ Fake API (données test)
    this.fakeApiFetchEntreprise(siret)
      .then((entreprise) => {
        this.entrepriseTrouvee = entreprise;
        this.isResultModalOpen = true;
      })
      .catch(() => {
        this.errorMessage = "Aucune entreprise trouvée pour ce SIRET.";
      });
  }

  closeModal() {
    this.isResultModalOpen = false;
  }

  onRetour() {
    this.closeModal();
  }

  onValider() {
    if (!this.entrepriseTrouvee) return;

    this.router.navigate(['/lab-dashboard-dossier']);
    this.closeModal();
  }

  private fakeApiFetchEntreprise(siret: string): Promise<Entreprise> {
    const db: Record<string, Entreprise> = {
      '55210055400013': {
        siret: '55210055400013',
        nom: 'SAS Les Garçons Coiffeurs',
        adresse: '12 rue du Centre, 25000 Besançon',
      },
      '79999999900018': {
        siret: '79999999900018',
        nom: 'SARL Boulangerie du Centre',
        adresse: '4 place de la Mairie, 39100 Dole',
      },
      '12345678901234': {
        siret: '12345678901234',
        nom: 'EURL Atelier du Web',
        adresse: '8 avenue des Arts, 90000 Belfort',
      },
    };

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const found = db[siret];
        if (found) resolve(found);
        else reject();
      }, 350);
    });
  }
}
