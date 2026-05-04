import { shouldCapture, buildEventKey } from '../filter/event-filter';
import { AuditConfig } from '../config/audit-config';

describe('EventFilter', () => {
  const baseConfig: Partial<AuditConfig> = {
    serviceName: 'test-service',
    captureAll: true,
    excludedEvents: [],
    includedEvents: [],
  };

  const event = {
    entityType: 'USER',
    eventAction: 'LOGIN',
  };

  it('should build correct event key', () => {
    const key = buildEventKey(event as any, 'test-service');
    expect(key).toBe('TEST_SERVICE.USER.LOGIN');
  });

  it('should capture all when AUDIT_CAPTURE_ALL is true', () => {
    expect(shouldCapture(event as any, baseConfig as any)).toBe(true);
  });

  it('should suppress when key is in excluded list', () => {
    const config = { ...baseConfig, excludedEvents: ['TEST_SERVICE.USER.LOGIN'] };
    expect(shouldCapture(event as any, config as any)).toBe(false);
  });

  it('should only capture included when AUDIT_CAPTURE_ALL is false', () => {
    const config = { 
      ...baseConfig, 
      captureAll: false, 
      includedEvents: ['TEST_SERVICE.USER.LOGIN'] 
    };
    expect(shouldCapture(event as any, config as any)).toBe(true);
    
    const otherEvent = { entityType: 'ORDER', eventAction: 'PLACE' };
    expect(shouldCapture(otherEvent as any, config as any)).toBe(false);
  });
});
