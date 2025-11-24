import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OnInit } from '@angular/core';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { DbService } from '../../services/db-service';

@Component({
  selector: 'app-portal-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './portal-login.html',
  styleUrls: ['./portal-login.scss']
})
export class PortalLoginComponent implements OnInit {
  
  loginForm: FormGroup;
  isLoading = false;
  errorMessage: string | null = null;

  suggestions: any;
  isSearching = false;
  
  showSuggestions = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private db: DbService,
  ) {
    this.loginForm = this.fb.group({
      collaboratorCode: ['', [
        Validators.required,
        Validators.pattern(/^[a-zA-Z]{3}$/)
      ]]
    });
  }

  ngOnInit() {
    const logoutMsg = localStorage.getItem('logoutReason');
    if (logoutMsg) {
      this.errorMessage = logoutMsg;
    }

    this.loginForm.get('collaboratorCode')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(code => {
          this.isSearching = true;
          this.showSuggestions = true;
          return this.db.GetListeCollaborateurs(code);
        })
      )
      .subscribe(suggestions => {
        this.suggestions = suggestions;
        this.isSearching = false;
      });
  }

  selectCode(code: string) {
    this.loginForm.get('collaboratorCode')?.setValue(code);
    this.suggestions = [];
    this.showSuggestions = false;
  }

  onFocus() {
    if (this.suggestions) {
      this.showSuggestions = true;
    }
  }

  onBlur() {
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    
    const code = this.loginForm.get('collaboratorCode')?.value.toUpperCase();

    this.db.VerifCollaborateur(code).subscribe({
      next: (res) => {
        localStorage.setItem('collaborateur', JSON.stringify(res.collaborateur));
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = "Le code collaborateur est invalide.";
        console.error(err);
      }
    });
  }
}