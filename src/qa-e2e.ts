import { createAuditLogger } from './index';

async function runQA() {
  console.log('--- STARTING QA EVALUATION ---');

  // We explicitly configure the logger to simulate the variables in .env
  const logger = createAuditLogger({
    serviceName: 'test-qa-service',
    mode: 'api',
    auditApiBaseUrl: 'http://localhost:9999/api/v1', // explicitly broken URL to trigger RETRY and BUFFER
    auditApiKey: 'test-key',
    auditApiTimeoutMs: 1000,
    captureAll: true,
    excludedEvents: ['test-qa-service.SYSTEM.HEALTH_CHECK'], // EXCLUSION CONFIG
    piiStrategy: 'mask',
    piiFields: ['metadata.email', 'metadata.phone'], // PII CONFIG
    piiMaskConfig: {
      email: { showFirst: 2, showDomain: true },
      phone: { showLast: 3 }
    },
    localStorageEnabled: true, // OFFLINE CONFIG
    localStorageType: 'file',
    localStorageMaxSize: 100,
    localStoragePath: '/tmp/.audit-buffer-qa.json',
    retryLimit: 1, // small limit to quickly fail
    retryDelayMs: 200,
    sdkLogLevel: 'debug',
    sdkLogFailures: true
  });

  console.log('\n[1] Testing PII Masking:');
  
  // Notice we use the raw emit to capture the object just before send
  // Wait, if we use emit(), it doesn't return the event. 
  // Let's use emit() and then read the buffer file to see what was serialized!
  await logger.emit({
    entityType: 'USER',
    eventType: 'ACTION',
    eventAction: 'SECURE_LOGIN',
    metadata: {
      email: 'john.doe@example.com', // Should become jo***@example.com
      phone: '1234567890',           // Should become *******890
      safeField: 'visible'
    }
  });


  console.log('\n[2] Testing Event Filtering:');
  await logger.emit({
    entityType: 'SYSTEM',
    eventType: 'ACTION',
    eventAction: 'HEALTH_CHECK' // key is test-qa-service.SYSTEM.HEALTH_CHECK
  });

  console.log('\n[3] Testing Offline Buffer Integration...');
  // It will attempt to send event1 to port 9999 (which fails), retry once, and then write to /tmp/.audit-buffer-qa.json.
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\n--- QA EVALUATION FINISHED ---');
  process.exit(0);
}

runQA().catch(console.error);
