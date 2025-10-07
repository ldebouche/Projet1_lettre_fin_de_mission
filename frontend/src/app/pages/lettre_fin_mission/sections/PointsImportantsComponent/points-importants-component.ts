import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-points-importants-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
  ],
  templateUrl: './points-importants-component.html',
  styleUrl: './points-importants-component.scss'
})
export class PointsImportantsComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() data!: FormControl;
}
