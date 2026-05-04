import { processPii } from '../pii/pii-processor';

describe('PIIProcessor', () => {
  const config = {
    piiStrategy: 'mask',
    piiFields: ['metadata.email', 'metadata.phone'],
    piiMaskConfig: {
      email: { showFirst: 2, showDomain: true },
      phone: { showLast: 3 },
    },
    piiHashAlgorithm: 'sha256',
    piiEncryptKey: Buffer.alloc(32).toString('base64'),
    piiEncryptIvLength: 16,
  };

  const event = {
    entityType: 'USER',
    eventAction: 'UPDATE',
    metadata: {
      email: 'john.doe@example.com',
      phone: '+1234567890',
      other: 'secret',
    },
  };

  it('should mask PII fields correctly', () => {
    const result: any = processPii(event as any, config as any);
    expect(result.metadata.email).toBe('jo***@example.com');
    expect(result.metadata.phone).toBe('***890');
    expect(result.metadata.other).toBe('secret'); // Non-PII field remains untouched
  });

  it('should hash fields when strategy is hash', () => {
    const hashConfig = { ...config, piiStrategy: 'hash' };
    const result: any = processPii(event as any, hashConfig as any);
    expect(result.metadata.email).toHaveLength(64); // SHA-256 hex
    expect(result.metadata.email).not.toBe(event.metadata.email);
  });

  it('should encrypt fields when strategy is encrypt', () => {
    const encryptConfig = { ...config, piiStrategy: 'encrypt' };
    const result: any = processPii(event as any, encryptConfig as any);
    expect(result.metadata.email).toMatch(/^.+:.+:.+$/); // iv:tag:ciphertext
  });

  it('should do nothing when strategy is none', () => {
    const noneConfig = { ...config, piiStrategy: 'none' };
    const result = processPii(event as any, noneConfig as any);
    expect(result).toEqual(event);
  });
});
