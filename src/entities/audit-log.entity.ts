import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ name: 'service_name' })
  serviceName!: string;

  @Column({ name: 'entity_type' })
  entityType!: string;

  @Column({ name: 'event_type' })
  eventType!: string;

  @Column({ name: 'event_action', nullable: true })
  eventAction!: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId?: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId?: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  actorId?: string;

  @Column({ name: 'user_role', nullable: true })
  userRole?: string;

  @Column({ name: 'device_platform', nullable: true })
  devicePlatform?: string;

  @Column({ type: 'jsonb', nullable: true })
  context?: any;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @Column({ name: 'human_message', type: 'text', nullable: true })
  humanMessage?: string;

  @Column({ default: 'SUCCESS' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
