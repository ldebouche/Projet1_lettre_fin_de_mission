import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { take } from 'rxjs/operators';

import { DataService } from '../../services/data-service';
import {
  ActiviteKey,
  getActiviteLabel,
  getActiviteUrl,
  isActiviteKey,
} from './mon-activite-config';

@Component({
  selector: 'app-mon-activite',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mon-activite.html',
  styleUrl: './mon-activite.scss',
})
export class MonActiviteComponent implements OnInit {
  titre = 'Mon activité';
  iframeUrl: SafeResourceUrl | null = null;
  errorMessage: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private dataService: DataService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const key = params.get('rapport');
      this.dataService.collaborateur$.pipe(take(1)).subscribe((collab) => {
        this.loadRapport(key, collab?.groupes_microsoft || []);
      });
    });
  }

  private loadRapport(key: string | null, groupes: string[]): void {
    this.iframeUrl = null;
    this.errorMessage = null;

    if (!isActiviteKey(key)) {
      this.errorMessage = 'Rapport inconnu.';
      return;
    }

    const activiteKey: ActiviteKey = key;
    this.titre = getActiviteLabel(activiteKey);

    const url = getActiviteUrl(activiteKey, groupes);

    if (!url) {
      this.errorMessage = "Vous n'avez pas accès à ce rapport.";
      return;
    }

    this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
