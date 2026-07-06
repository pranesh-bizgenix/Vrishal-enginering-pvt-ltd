import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectTypeToProjectsTable1710672000011 implements MigrationInterface {
  name = 'AddProjectTypeToProjectsTable1710672000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN "project_type" character varying(255) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "project_type"`,
    );
  }
}
