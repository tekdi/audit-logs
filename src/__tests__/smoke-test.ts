import { AuditLogger } from '../audit-logger';

async function runSmokeTest() {
  console.log('🚀 Starting AuditLogger Smoke Test...');

  // 1. Initialize with specific config
  const logger = new AuditLogger({
    serviceName: 'smoke-test-service',
    mode: 'api', // Use API mode for simpler mocking
    auditApiBaseUrl: 'http://mock-api',
    piiStrategy: 'mask',
    piiFields: ['metadata.email'],
    piiMaskConfig: {
      email: { showFirst: 2, showDomain: true },
    },
    enabled: true,
  });

  // Mock the API transport to avoid actual network calls
  // We'll peek into what was dispatched
  const capturedEvents: any[] = [];
  
  // Monkey-patch sendToApi for this test
  const apiTransport = require('../transports/api-transport');
  const originalSend = apiTransport.sendToApi;
  apiTransport.sendToApi = async (event: any) => {
    capturedEvents.push(event);
    console.log('✅ Captured event in mock transport');
  };

  try {
    // 2. Emit an event
    await logger.emit({
      entityType: 'USER',
      eventAction: 'SIGNUP',
      entityId: 'uuid-123',
      actorId: 'actor-456',
      metadata: {
        email: 'smoke@test.com',
        plan: 'pro',
      },
      context: {
        platform: 'ios',
      },
    });

    console.log('📊 Verifying event structure...');
    const event = capturedEvents[0];
    
    if (!event) throw new Error('No event captured!');
    
    // Check enrichment
    if (event.serviceName !== 'smoke-test-service') throw new Error('Service name enrichment failed');
    if (event.eventType !== 'CREATE') throw new Error('EventType inference failed');
    if (!event.occurredAt) throw new Error('Timestamp enrichment failed');

    // Check PII masking
    if (event.metadata.email !== 'sm***@test.com') {
      throw new Error(`PII masking failed. Got: ${event.metadata.email}`);
    }

    // Check Human Message
    if (!event.humanMessage.includes('[SMOKE-TEST-SERVICE]')) {
      throw new Error('Human message generation failed');
    }

    console.log('✨ Smoke test PASSED successfully!');
  } catch (err) {
    console.error('❌ Smoke test FAILED:', err);
    process.exit(1);
  } finally {
    // Restore
    apiTransport.sendToApi = originalSend;
    await logger.shutdown();
  }
}

runSmokeTest();
