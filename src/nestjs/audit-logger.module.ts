import { Module, DynamicModule, Global } from '@nestjs/common';
import { AuditLoggerService } from './audit-logger.service';
import { AuditLoggerOptions } from '../audit-logger';

@Global()
@Module({})
export class AuditLoggerModule {
  /**
   * Register the AuditLoggerModule globally.
   * By default, it reads all configuration from process.env.
   */
  static forRoot(options: AuditLoggerOptions = {}): DynamicModule {
    return {
      module: AuditLoggerModule,
      providers: [
        {
          provide: AuditLoggerService,
          useValue: new AuditLoggerService(options),
        },
      ],
      exports: [AuditLoggerService],
    };
  }
}
