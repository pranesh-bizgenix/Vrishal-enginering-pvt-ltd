import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeesTable1710672000001 implements MigrationInterface {
  name = 'AddEmployeesTable1710672000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        roles VARCHAR(50)[] NOT NULL DEFAULT ARRAY['EMPLOYEE']::VARCHAR(50)[],
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        phone VARCHAR(50) NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT fk_users_employee_id
      FOREIGN KEY (employee_id)
      REFERENCES employees(id)
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_employee_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS employees`);
  }
}
