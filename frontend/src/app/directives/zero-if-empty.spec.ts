import { ZeroIfEmpty } from './zero-if-empty';

describe('ZeroIfEmpty', () => {
  it('should create an instance', () => {
    const directive = new ZeroIfEmpty();
    expect(directive).toBeTruthy();
  });
});
