import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { closeDataSource } from './../src/database/data-source';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await closeDataSource();
  });

  it('/api/ems/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/ems/health')
      .expect(200)
      .expect({ module: 'core', status: 'ok' });
  });
});
