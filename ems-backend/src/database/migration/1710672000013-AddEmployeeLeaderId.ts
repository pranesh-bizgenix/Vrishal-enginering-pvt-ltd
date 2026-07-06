import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeLeaderId1710672000013 implements MigrationInterface {
  name = 'AddEmployeeLeaderId1710672000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS leader_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employees
      DROP COLUMN IF EXISTS leader_id
    `);
  }
}
