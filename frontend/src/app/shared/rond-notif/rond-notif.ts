import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-rond-notif',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './rond-notif.html',
  styleUrls: ['./rond-notif.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RondNotifComponent {
  @Input() value: string | number | null = null;
  @Input() size = 16;
  @Input() bgColor = '#e53935';
  @Input() textColor = '#fff';
  @Input() top?: string;
  @Input() right?: string;
  @Input() bottom?: string;
  @Input() left?: string;
  @Input() translateX = '0';
  @Input() translateY = '0';

  get display(): string {
    return this.value === null || this.value === undefined ? '' : String(this.value);
  }

  get hidden(): boolean {
    return this.display.length === 0;
  }

  get bgColorStyle(): string {
    return this.value === 0 || this.value === '0' ? '#43a047' : '#e53935';
  }
}
