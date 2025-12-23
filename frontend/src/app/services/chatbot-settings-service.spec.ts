import { TestBed } from '@angular/core/testing';

import { ChatbotSettingsService } from './chatbot-settings-service';

describe('ChatbotSettingsService', () => {
  let service: ChatbotSettingsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatbotSettingsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
