import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '12345',
  database: process.env.DB_NAME || 'ems_ems',
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

export async function closeDataSource() {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
