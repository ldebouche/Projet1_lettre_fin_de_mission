import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-cartes-principales',
  imports: [],
  templateUrl: './cartes-principales.html',
  styleUrl: './cartes-principales.scss'
})
export class CartesPrincipalesComponent {
  @Input() name: string = '';
}
