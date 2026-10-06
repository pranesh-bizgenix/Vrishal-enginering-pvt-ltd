import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 5010, '0.0.0.0');
}

void bootstrap();
