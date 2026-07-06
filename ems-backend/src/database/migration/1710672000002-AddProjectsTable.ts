import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectsTable1710672000002 implements MigrationInterface {
  name = 'AddProjectsTable1710672000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(120) NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        due_date TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_projects_active ON projects (active)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_projects_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS projects`);
  }
}
