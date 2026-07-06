import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskAssignmentsTable1710672000005 implements MigrationInterface {
  name = 'AddTaskAssignmentsTable1710672000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_assignments (
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (task_id, employee_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS task_assignments`);
  }
}
