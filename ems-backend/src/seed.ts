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

const LEGACY_ADMIN_EMAIL = 'admin@sjsangath.com';
const VRISHAL_ADMIN_EMAIL = 'admin@vrishalengineering.com';

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
      email: VRISHAL_ADMIN_EMAIL,
      password: hashPassword('vrishal@123'),
      phone: '',
      roles: ['SA1'],
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
      `UPDATE users
       SET email = $1,
           updated_at = $2
       WHERE email = $3
         AND NOT EXISTS (SELECT 1 FROM users WHERE email = $1)`,
      [employee.email, employee.updatedAt, LEGACY_ADMIN_EMAIL],
    );

    const existingUsers = await AppDataSource.query(
      `SELECT id
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [employee.email],
    );
    if (existingUsers[0]?.id) {
      employee.id = existingUsers[0].id;
    }

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
