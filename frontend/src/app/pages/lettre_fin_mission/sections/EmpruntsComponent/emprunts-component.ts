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
    if (!this.group) return;
    
    const raw = this.group.get('emprunts')?.value;
    this.emprunts = raw?.global.emprunts || [];
  }

  onDesignationInput(emp: any, value: string): void {
    emp.E_designation = value;

    const ctrl = this.group.get('emprunts') as FormControl | null;
    const current = ctrl?.value;
    if (!ctrl || !current?.global) return;

    ctrl.patchValue(
      {
        ...current,
        global: {
          ...current.global,
          emprunts: this.emprunts,
        },
      },
      { emitEvent: true }
    );
    ctrl.markAsDirty();
  }

  getValue(val: any): string {
    if (val == null || val === '') return '';

    return Math.round(Number(val)).toLocaleString('fr-FR');
  }
}