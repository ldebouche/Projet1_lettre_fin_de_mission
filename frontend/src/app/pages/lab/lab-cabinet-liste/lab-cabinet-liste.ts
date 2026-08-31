import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LabCarteComponent } from '../lab-carte/lab-carte';

@Component({
  selector: 'app-lab-cabinet-liste',
  standalone: true,
  imports: [CommonModule, LabCarteComponent],
  templateUrl: './lab-cabinet-liste.html',
  styleUrls: ['./lab-cabinet-liste.scss'],
})
export class LabCabinetListeComponent {}
