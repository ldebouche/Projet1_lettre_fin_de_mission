import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { DbService } from '../../services/db-service';

@Component({
  selector: 'app-accueil-intranet',
  imports: [
    CommonModule
  ],
  templateUrl: './accueil-intranet.html',
  styleUrl: './accueil-intranet.scss'
})
export class AccueilIntranet implements OnInit {
  collaborateur: any;
  errorMessage: string = '';

  constructor(
    private router: Router,
    private db: DbService
  ) {}

  ngOnInit(): void {
    this.db.VerifCollaborateur().subscribe({
      next: (res) => {
        localStorage.setItem('collaborateur', JSON.stringify(res.collaborateur));
        this.collaborateur = res.collaborateur;
      },
      error: (err) => {
        this.errorMessage = "Le code collaborateur est invalide.";
        console.error(err);
      }
    });
  }

  onClick() {
    if (this.collaborateur) {
      this.router.navigate(['/dashboard']);
    }
  }
}
