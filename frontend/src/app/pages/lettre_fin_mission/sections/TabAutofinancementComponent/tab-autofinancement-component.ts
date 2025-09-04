import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'section-tab-autofinancement-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './tab-autofinancement-component.html',
  styleUrl: './tab-autofinancement-component.scss'
})
export class TabAutofinancementComponent {
  @Input({ required: true }) group!: FormGroup;
}
