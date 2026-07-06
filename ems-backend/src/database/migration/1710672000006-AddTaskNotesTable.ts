import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskNotesTable1710672000006 implements MigrationInterface {
  name = 'AddTaskNotesTable1710672000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_notes (
        id UUID PRIMARY KEY,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        mark_done BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes (task_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_notes_task_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS task_notes`);
  }
}
