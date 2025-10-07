import { TestBed } from '@angular/core/testing';

import { FiscaliteService } from './fiscalite-service';

describe('FiscaliteService', () => {
  let service: FiscaliteService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FiscaliteService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
