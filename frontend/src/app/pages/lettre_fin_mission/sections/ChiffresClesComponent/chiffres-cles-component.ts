import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-chiffres-cles',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
  ],
  templateUrl: './chiffres-cles-component.html',
  styleUrls: ['./chiffres-cles-component.scss']
})
export class ChiffresClesComponent {
  @Input({ required: true }) group!: FormGroup;

  get progressionChiffre(): FormGroup {
    return this.group.get('progressionChiffre') as FormGroup;
  }

  get tauxMarge(): FormGroup {
    return this.group.get('tauxMarge') as FormGroup;
  }
}
