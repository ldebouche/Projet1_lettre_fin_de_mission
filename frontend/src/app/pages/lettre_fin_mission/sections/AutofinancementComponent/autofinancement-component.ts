import { Component, Input, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'section-autofinancement-component',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule
    ],
    templateUrl: './autofinancement-component.html',
    styleUrl: './autofinancement-component.scss'
})
export class AutofinancementComponent implements OnInit {
    @Input({ required: true }) group!: FormGroup;

  ngOnInit() {
    if (!this.group) return;
    
    const initial = this.group.value;
    this.calculerAutofinancement(initial);

    this.group.valueChanges.subscribe(values => {
      this.calculerAutofinancement(values);
    });
  }

  private calculerAutofinancement(values: any) {
    // CAF = Résultat net + Dotations - Reprises - Cessions + Subventions
    const capaAutofCalculee =
      (values.resEx || 0) +
      (values.dota || 0) -
      (values.reprises || 0) -
      (values.cessions || 0) +
      (values.subv || 0);

    // CAF Net = CAF - Remboursements - Dividendes
    const capaAutofNetCalculee =
      capaAutofCalculee -
      (values.rembours || 0) -
      (values.divi || 0);

    // Mettre à jour les valeurs dans le formulaire
    const capaAutofValue = Math.round(capaAutofCalculee);
    const capaAutofNetValue = Math.round(capaAutofNetCalculee);

    const needsEmit = this.group.get('capaAutof')?.value !== capaAutofValue;

    this.group.patchValue({
      capaAutof: capaAutofValue,
      capaAutofNet: capaAutofNetValue
    }, { emitEvent: needsEmit });
  }
}
