import { TestBed } from '@angular/core/testing';

import { AnaSectoService } from './ana-secto-service';

describe('AnaSectoService', () => {
  let service: AnaSectoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AnaSectoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
