import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeToTaskNotesTable1710672000010 implements MigrationInterface {
  name = 'AddEmployeeToTaskNotesTable1710672000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE task_notes
      ADD COLUMN IF NOT EXISTS employee_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_task_notes_employee_id ON task_notes (employee_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_notes_employee_id`);
    await queryRunner.query(
      `ALTER TABLE task_notes DROP COLUMN IF EXISTS employee_id`,
    );
  }
}
