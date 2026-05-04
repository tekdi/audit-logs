import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('message_templates')
export class MessageTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_name' })
  serviceName!: string;

  @Column({ name: 'entity_type' })
  entityType!: string;

  @Column({ name: 'event_type' })
  eventType!: string;

  @Column({ name: 'event_action', nullable: true })
  eventAction?: string;

  @Column({ name: 'language_code', default: 'en' })
  languageCode!: string;

  @Column({ type: 'text' })
  template!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
