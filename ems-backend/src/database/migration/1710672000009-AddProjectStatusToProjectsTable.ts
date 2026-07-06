import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectStatusToProjectsTable1710672000009 implements MigrationInterface {
  name = 'AddProjectStatusToProjectsTable1710672000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS project_status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED'
    `);

    await queryRunner.query(`
      UPDATE projects
      SET project_status = CASE
        WHEN deleted_at IS NOT NULL OR active = FALSE THEN 'COMPLETED'
        ELSE 'NOT_STARTED'
      END
      WHERE project_status IS NULL OR project_status = ''
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_projects_project_status ON projects (project_status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_projects_project_status`);
    await queryRunner.query(
      `ALTER TABLE projects DROP COLUMN IF EXISTS project_status`,
    );
  }
}
