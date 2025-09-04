import { Component , Input} from '@angular/core';
import { ReactiveFormsModule, FormArray, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-info-fiscale-component',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './info-fiscale-component.html',
  styleUrls: ['./info-fiscale-component.scss']
})
export class InfoFiscaleComponent {
  @Input() formArray!: FormArray<FormControl<boolean>>;
  @Input() items: string[] = [];
}
