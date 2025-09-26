import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-faits-marquants-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './faits-marquants-component.html',
  styleUrl: './faits-marquants-component.scss'
})
export class FaitsMarquantsComponent {
  @Input({ required: true }) group!: FormGroup;
}
