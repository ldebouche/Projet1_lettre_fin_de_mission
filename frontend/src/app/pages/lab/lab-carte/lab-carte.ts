import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-lab-carte',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-carte.html',
  styleUrls: ['./lab-carte.scss'],
})
export class LabCarteComponent {
  @Input() title = '';
  @Input() subtitle = '';
}
