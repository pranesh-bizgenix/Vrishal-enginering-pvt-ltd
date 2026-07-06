import 'dotenv/config';
import {
  AppDataSource,
  closeDataSource,
  ensureDataSourceInitialized,
} from './data-source';

export async function runMigrations() {
  await ensureDataSourceInitialized();
  try {
    console.log('Starting migrations...');
    await AppDataSource.runMigrations();
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await closeDataSource();
  }
}

if (require.main === module) {
  void runMigrations().catch((error) => {
    console.error('Migration failed', error);
    process.exit(1);
  });
}
