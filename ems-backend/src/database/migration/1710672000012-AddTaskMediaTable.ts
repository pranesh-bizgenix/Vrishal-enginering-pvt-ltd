import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskMediaTable1710672000012 implements MigrationInterface {
  name = 'AddTaskMediaTable1710672000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_media (
        id UUID PRIMARY KEY,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        url TEXT NOT NULL,
        label VARCHAR(255),
        mime_type VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS task_media');
  }
}
