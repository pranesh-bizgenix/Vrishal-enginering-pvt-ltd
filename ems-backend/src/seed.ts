import { randomBytes, randomUUID, scryptSync } from 'crypto';
import {
  AppDataSource,
  closeDataSource,
  ensureDataSourceInitialized,
} from './database/data-source';
import { runMigrations } from './database/run-migrations';

type SeedEmployee = {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function loadSeedEmployees(): SeedEmployee[] {
  const now = new Date().toISOString();
  return [
    {
      id: randomUUID(),
      name: 'Admin',
      email: 'admin@sjsangath.com',
      password: hashPassword('sjsangath@123'),
      phone: '',
      roles: ['ADMIN'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ];
}

async function bootstrap() {
  await runMigrations();
  await ensureDataSourceInitialized();
  const employees = loadSeedEmployees();

  for (const employee of employees) {
    await AppDataSource.query(
      `INSERT INTO employees (
        id,
        name,
        roles,
        is_active,
        phone,
        created_at,
        updated_at,
        deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        roles = EXCLUDED.roles,
        is_active = EXCLUDED.is_active,
        phone = EXCLUDED.phone,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
      [
        employee.id,
        employee.name,
        employee.roles,
        employee.isActive,
        employee.phone,
        employee.createdAt,
        employee.updatedAt,
        employee.deletedAt,
      ],
    );

    await AppDataSource.query(
      `INSERT INTO users (
        id,
        email,
        password,
        roles,
        employee_id,
        created_at,
        updated_at,
        deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email)
      DO UPDATE SET
        password = EXCLUDED.password,
        roles = EXCLUDED.roles,
        employee_id = EXCLUDED.employee_id,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
      [
        employee.id,
        employee.email,
        employee.password,
        employee.roles,
        employee.id,
        employee.createdAt,
        employee.updatedAt,
        employee.deletedAt,
      ],
    );
  }

  console.log(`Seed complete for ${employees.length} user(s).`);
  await closeDataSource();
}

void bootstrap().catch(async (error) => {
  console.error('Seed failed.', error);
  await closeDataSource();
  process.exit(1);
});
