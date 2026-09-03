import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LabService } from '../../../services/lab-service';

@Component({
  selector: 'app-lab-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './lab-shell.html',
  styleUrls: ['./lab-shell.scss'],
})
export class LabShellComponent implements OnInit {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() pill = '';

  canReadParametrage = false;
  canAccessCartographie = false;

  constructor(private labService: LabService) {}

  ngOnInit(): void {
    this.labService.getMeLab().subscribe({
      next: (res) => {
        this.canReadParametrage = !!res.data?.canReadParametrage;
        this.canAccessCartographie = !!res.data?.canAccessCartographie || this.canReadParametrage;
      },
      error: () => {
        this.canReadParametrage = false;
        this.canAccessCartographie = false;
      },
    });
  }
}
