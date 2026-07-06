import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationLogsTable1710672000007 implements MigrationInterface {
  name = 'AddNotificationLogsTable1710672000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id UUID PRIMARY KEY,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SENT',
        channel TEXT NOT NULL DEFAULT 'WHATSAPP',
        recipient_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs (created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_category ON notification_logs (category)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_notification_logs_category`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_notification_logs_created_at`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS notification_logs`);
  }
}
