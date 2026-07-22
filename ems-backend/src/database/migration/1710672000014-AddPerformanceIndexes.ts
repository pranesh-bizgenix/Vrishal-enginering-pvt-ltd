import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1710672000014 implements MigrationInterface {
  name = 'AddPerformanceIndexes1710672000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS created_by_employee_id UUID NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tasks_created_by_employee'
        ) THEN
          ALTER TABLE tasks
          ADD CONSTRAINT fk_tasks_created_by_employee
          FOREIGN KEY (created_by_employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_employees_active_deleted ON employees (is_active, deleted_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_employees_leader_id ON employees (leader_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_projects_deleted_created ON projects (deleted_at, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_projects_deleted_status ON projects (deleted_at, project_status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_projects_deleted_due_date ON projects (deleted_at, due_date)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_project_assignments_employee_project ON project_assignments (employee_id, project_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_deleted_created ON tasks (deleted_at, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_deleted_status ON tasks (deleted_at, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_deleted_due_date ON tasks (deleted_at, due_date)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_created_by_employee ON tasks (created_by_employee_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_task_assignments_employee_task ON task_assignments (employee_id, task_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_task_notes_task_created ON task_notes (task_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_task_media_task_created ON task_media (task_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_channel_created ON notification_logs (channel, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_category_created ON notification_logs (category, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notification_logs_category_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notification_logs_channel_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_media_task_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_notes_task_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_assignments_employee_task`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_created_by_employee`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_deleted_due_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_deleted_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_deleted_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_project_assignments_employee_project`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_projects_deleted_due_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_projects_deleted_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_projects_deleted_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_employees_leader_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_employees_active_deleted`);
  }
}
