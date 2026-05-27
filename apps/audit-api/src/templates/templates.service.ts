import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageTemplate, AuditEvent } from '@tekdi/audit-logger';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(MessageTemplate)
    private readonly repo: Repository<MessageTemplate>,
  ) {}

  async findTemplate(params: {
    serviceName: string;
    entityType: string;
    eventAction: string;
    languageCode: string;
    fallbackLanguage?: string;
  }): Promise<MessageTemplate | null> {
    // 1. Try primary language
    let template = await this.repo.findOne({
      where: {
        serviceName: params.serviceName,
        entityType: params.entityType,
        eventAction: params.eventAction,
        languageCode: params.languageCode,
        isActive: true,
      },
    });

    // 2. Try fallback language if not found
    if (!template && params.fallbackLanguage && params.fallbackLanguage !== params.languageCode) {
      template = await this.repo.findOne({
        where: {
          serviceName: params.serviceName,
          entityType: params.entityType,
          eventAction: params.eventAction,
          languageCode: params.fallbackLanguage,
          isActive: true,
        },
      });
    }

    return template;
  }

  /** Interpolate a template string using {{dot.path}} syntax from the event. */
  interpolate(template: string, event: AuditEvent): string {
    const root = event as any;
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
      const parts = path.trim().split('.');
      let val = parts.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), root);
      return val === undefined || val === null ? '' : String(val);
    });
  }

  // --- CRUD ---

  async findAll() {
    return this.repo.find({ where: { isActive: true } });
  }

  async create(data: Partial<MessageTemplate>) {
    const t = this.repo.create(data);
    return this.repo.save(t);
  }

  async remove(id: string) {
    await this.repo.update(id, { isActive: false });
  }
}
