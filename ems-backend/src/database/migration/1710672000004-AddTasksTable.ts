import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTasksTable1710672000004 implements MigrationInterface {
  name = 'AddTasksTable1710672000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type VARCHAR(50) NOT NULL DEFAULT 'SIMPLE',
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        due_date TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_project_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS tasks`);
  }
}
