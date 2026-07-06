import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectAssignmentsTable1710672000003 implements MigrationInterface {
  name = 'AddProjectAssignmentsTable1710672000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_assignments (
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (project_id, employee_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project_assignments`);
  }
}
