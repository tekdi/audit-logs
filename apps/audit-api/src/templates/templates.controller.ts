import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { MessageTemplate } from '@tekdi/audit-logger';

@Controller('api/v1/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async findAll() {
    return this.templatesService.findAll();
  }

  @Post()
  async create(@Body() data: Partial<MessageTemplate>) {
    return this.templatesService.create(data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }
}
