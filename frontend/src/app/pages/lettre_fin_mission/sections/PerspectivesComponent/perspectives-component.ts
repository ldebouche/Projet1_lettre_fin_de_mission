import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-perspectives-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
  ],
  templateUrl: './perspectives-component.html',
  styleUrl: './perspectives-component.scss'
})
export class PerspectivesComponent {
  @Input({ required: true }) group!: FormGroup;
}
