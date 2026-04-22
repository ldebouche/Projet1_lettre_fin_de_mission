import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-risque-de-cessation-component',
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './risque-de-cessation-component.html',
  styleUrl: './risque-de-cessation-component.scss',
})
export class RisqueDeCessationComponent {
  @Input({ required: true }) group!: FormGroup;
}
