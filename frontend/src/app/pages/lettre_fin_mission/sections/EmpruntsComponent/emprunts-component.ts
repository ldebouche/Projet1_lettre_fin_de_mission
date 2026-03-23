import { Component, Input, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'section-emprunts-component',
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './emprunts-component.html',
  styleUrl: './emprunts-component.scss',
})
export class EmpruntsComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;

  emprunts: any[] = [];

  ngOnInit() {
    const raw = this.group.get('emprunts')?.value;
    this.emprunts = raw?.global.emprunts || [];
  }

  getValue(val: any): string {
    if (val == null || val === '') return '';

    return Math.round(Number(val)).toLocaleString('fr-FR');
  }
}