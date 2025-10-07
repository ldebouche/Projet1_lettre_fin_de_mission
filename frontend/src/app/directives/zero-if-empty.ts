import { Directive, HostListener } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: 'input[type=number][formControlName], input[type=number][formControl]',
  standalone: true
})
export class ZeroIfEmpty {
  constructor(private control: NgControl) {}

  @HostListener('blur')
  onBlur() {
    const value = this.control.control?.value;
    if (value === null || value === '') {
      this.control.control?.setValue(0);
    }
  }
}
