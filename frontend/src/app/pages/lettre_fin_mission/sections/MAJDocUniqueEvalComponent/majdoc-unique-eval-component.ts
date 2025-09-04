import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-majdoc-unique-eval-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './majdoc-unique-eval-component.html',
  styleUrl: './majdoc-unique-eval-component.scss'
})
export class MAJDocUniqueEvalComponent {
  @Input({ required: true }) group!: FormGroup;
}
