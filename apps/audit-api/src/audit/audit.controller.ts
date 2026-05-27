import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EnrichedAuditEvent } from '../../../../packages/audit-logger/src/types/audit-event';

@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('log')
  async log(@Body() event: EnrichedAuditEvent) {
    return this.auditService.log(event);
  }

  @Get('logs')
  async findAll(@Query() query: any) {
    return this.auditService.findAll(query);
  }
}
