import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-protec-sociale-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './protec-sociale-component.html',
  styleUrl: './protec-sociale-component.scss'
})
export class ProtecSocialeComponent {
  @Input({ required: true }) group!: FormGroup;
}
