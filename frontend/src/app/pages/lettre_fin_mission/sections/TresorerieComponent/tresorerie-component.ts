import { Component , Input, OnInit} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BtnToTextareaComponent } from '../../../../shared/bouton-textarea/bouton-textarea';

@Component({
  selector: 'section-tresorerie-component',
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    BtnToTextareaComponent
  ],
  templateUrl: './tresorerie-component.html',
  styleUrl: './tresorerie-component.scss'
})
export class TresorerieComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;

  emprunts: any[] = [];

  ngOnInit() {
    this.emprunts = this.group.get('emprunts')?.value;
  }
  getValue(val: any): string {
    if (val == null || val === '') return '';

    return Math.round(Number(val)).toLocaleString('fr-FR'); 
  }
}