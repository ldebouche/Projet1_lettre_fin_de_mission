import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-faits-marquants-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    BtnToTextareaComponent
  ],
  templateUrl: './faits-marquants-component.html',
  styleUrl: './faits-marquants-component.scss'
})
export class FaitsMarquantsComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() data!: FormControl;
}
