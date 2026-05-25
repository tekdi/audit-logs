import { interpolate, resolveMessage, inferEventType } from '../templates/template-resolver';

describe('TemplateResolver', () => {
  const event = {
    entityType: 'USER',
    eventAction: 'CREATE',
    metadata: {
      role: 'admin',
      email: 'john@example.com',
    },
    context: {
      platform: 'web',
    },
  };

  it('should interpolate {{dot.path}} correctly', () => {
    const template = 'User {{metadata.email}} created with role {{metadata.role}} on {{context.platform}}.';
    const result = interpolate(template, event as any);
    expect(result).toBe('User john@example.com created with role admin on web.');
  });

  it('should resolve message via template mapping', () => {
    const config = {
      serviceName: 'user-service',
      templateMappingJson: {
        'user-service.user.create': { templateKey: 'USER_CREATED' },
      },
    };
    const result = resolveMessage(event as any, config as any);
    expect(result).toBe('[TEMPLATE:USER_CREATED]');
  });

  it('should generate generic fallback when no mapping exists', () => {
    const config = {
      serviceName: 'user-service',
      templateMappingJson: {},
    };
    const result = resolveMessage(event as any, config as any);
    expect(result).toBe('[USER-SERVICE] USER CREATE action performed.');
  });

  it('should infer event type from action', () => {
    expect(inferEventType('USER_CREATED')).toBe('CREATE');
    expect(inferEventType('ACCOUNT_DELETED')).toBe('DELETE');
    expect(inferEventType('LOGIN_SUCCESS')).toBe('AUTH');
    expect(inferEventType('UPDATE_PROFILE')).toBe('UPDATE');
  });
});
