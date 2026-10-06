import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '12345',
  database: process.env.DB_NAME || 'ems_ems',
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
  extra: {
    max: 3,
  },
  entities: [],
  migrations: [__dirname + '/migration/*{.ts,.js}'],
  synchronize: false,
});

export async function ensureDataSourceInitialized() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  return AppDataSource;
}

async function hasTable(tableName: string) {
  const rows = await AppDataSource.query(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    [`public.${tableName}`],
  );
  return rows[0]?.exists === true;
}

async function hasColumn(tableName: string, columnName: string) {
  const rows = await AppDataSource.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS "exists"`,
    [tableName, columnName],
  );
  return rows[0]?.exists === true;
}

async function createIndexIfPossible(
  tableName: string,
  requiredColumns: string[],
  sql: string,
) {
  if (!(await hasTable(tableName))) {
    return;
  }

  for (const columnName of requiredColumns) {
    if (!(await hasColumn(tableName, columnName))) {
      return;
    }
  }

  await AppDataSource.query(sql);
}

export async function ensurePerformanceIndexes() {
  await ensureDataSourceInitialized();

  await createIndexIfPossible(
    'employees',
    ['is_active', 'deleted_at'],
    `CREATE INDEX IF NOT EXISTS idx_employees_active_deleted ON employees (is_active, deleted_at)`,
  );
  await createIndexIfPossible(
    'employees',
    ['leader_id'],
    `CREATE INDEX IF NOT EXISTS idx_employees_leader_id ON employees (leader_id)`,
  );
  await createIndexIfPossible(
    'projects',
    ['deleted_at', 'created_at'],
    `CREATE INDEX IF NOT EXISTS idx_projects_deleted_created ON projects (deleted_at, created_at DESC)`,
  );
  await createIndexIfPossible(
    'projects',
    ['deleted_at', 'project_status'],
    `CREATE INDEX IF NOT EXISTS idx_projects_deleted_status ON projects (deleted_at, project_status)`,
  );
  await createIndexIfPossible(
    'projects',
    ['deleted_at', 'due_date'],
    `CREATE INDEX IF NOT EXISTS idx_projects_deleted_due_date ON projects (deleted_at, due_date)`,
  );
  await createIndexIfPossible(
    'project_assignments',
    ['employee_id', 'project_id'],
    `CREATE INDEX IF NOT EXISTS idx_project_assignments_employee_project ON project_assignments (employee_id, project_id)`,
  );
  await createIndexIfPossible(
    'tasks',
    ['deleted_at', 'created_at'],
    `CREATE INDEX IF NOT EXISTS idx_tasks_deleted_created ON tasks (deleted_at, created_at DESC)`,
  );
  await createIndexIfPossible(
    'tasks',
    ['deleted_at', 'status'],
    `CREATE INDEX IF NOT EXISTS idx_tasks_deleted_status ON tasks (deleted_at, status)`,
  );
  await createIndexIfPossible(
    'tasks',
    ['deleted_at', 'due_date'],
    `CREATE INDEX IF NOT EXISTS idx_tasks_deleted_due_date ON tasks (deleted_at, due_date)`,
  );
  await createIndexIfPossible(
    'tasks',
    ['created_by_employee_id'],
    `CREATE INDEX IF NOT EXISTS idx_tasks_created_by_employee ON tasks (created_by_employee_id)`,
  );
  await createIndexIfPossible(
    'task_assignments',
    ['employee_id', 'task_id'],
    `CREATE INDEX IF NOT EXISTS idx_task_assignments_employee_task ON task_assignments (employee_id, task_id)`,
  );
  await createIndexIfPossible(
    'task_notes',
    ['task_id', 'created_at'],
    `CREATE INDEX IF NOT EXISTS idx_task_notes_task_created ON task_notes (task_id, created_at DESC)`,
  );
  await createIndexIfPossible(
    'task_media',
    ['task_id', 'created_at'],
    `CREATE INDEX IF NOT EXISTS idx_task_media_task_created ON task_media (task_id, created_at DESC)`,
  );
  await createIndexIfPossible(
    'notification_logs',
    ['channel', 'created_at'],
    `CREATE INDEX IF NOT EXISTS idx_notification_logs_channel_created ON notification_logs (channel, created_at DESC)`,
  );
  await createIndexIfPossible(
    'notification_logs',
    ['category', 'created_at'],
    `CREATE INDEX IF NOT EXISTS idx_notification_logs_category_created ON notification_logs (category, created_at DESC)`,
  );
}

export async function closeDataSource() {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
