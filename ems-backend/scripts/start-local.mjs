import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { access, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.join(projectDir, '.local', 'postgres');
const databaseName = process.env.DB_NAME || 'ems_ems';
const databaseUser = process.env.DB_USER || 'postgres';
const databasePassword = process.env.DB_PASS || '12345';
const databasePort = Number(process.env.DB_PORT || 5432);

if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error(`Invalid DB_PORT: ${process.env.DB_PORT}`);
}

const environment = {
  ...process.env,
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: String(databasePort),
  DB_USER: databaseUser,
  DB_PASS: databasePassword,
  DB_NAME: databaseName,
};

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: databaseUser,
  password: databasePassword,
  port: databasePort,
  persistent: true,
  onLog: (message) => console.log(`[postgres] ${message}`),
  onError: (message) => console.error(`[postgres] ${message}`),
});

let backend;
let stopping = false;

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectDir,
      env: environment,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} exited with ${signal || `code ${code}`}`,
        ),
      );
    });
  });
}

async function ensureDatabase() {
  const client = postgres.getPgClient();
  await client.connect();

  try {
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );

    if (result.rowCount === 0) {
      await postgres.createDatabase(databaseName);
      console.log(`Created local database "${databaseName}".`);
    }
  } finally {
    await client.end();
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeStalePostmasterPid() {
  const pidFile = path.join(databaseDir, 'postmaster.pid');
  if (!(await fileExists(pidFile))) {
    return;
  }

  const pid = Number.parseInt((await readFile(pidFile, 'utf8')).split(/\r?\n/, 1)[0], 10);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  await unlink(pidFile);
  console.log('Removed stale local PostgreSQL PID file.');
}

async function stop(exitCode = 0) {
  if (stopping) {
    return;
  }

  stopping = true;
  if (backend && !backend.killed) {
    backend.kill('SIGTERM');
  }

  await postgres.stop().catch((error) => {
    console.error('Could not stop local PostgreSQL cleanly:', error);
  });
  process.exitCode = exitCode;
}

async function main() {
  const isInitialized = await fileExists(path.join(databaseDir, 'PG_VERSION'));
  if (!isInitialized) {
    await postgres.initialise();
  }
  await removeStalePostmasterPid();
  await postgres.start();
  await ensureDatabase();

  const tsNode = path.join(projectDir, 'node_modules', 'ts-node', 'dist', 'bin.js');
  await run(process.execPath, [
    tsNode,
    '-r',
    'tsconfig-paths/register',
    'src/database/run-migrations.ts',
  ]);
  await run(process.execPath, [
    tsNode,
    '-r',
    'tsconfig-paths/register',
    'src/seed.ts',
  ]);

  const nestCli = path.join(
    projectDir,
    'node_modules',
    '@nestjs',
    'cli',
    'bin',
    'nest.js',
  );
  backend = spawn(process.execPath, [nestCli, 'start', '--watch'], {
    cwd: projectDir,
    env: environment,
    stdio: 'inherit',
  });
  backend.once('error', async (error) => {
    console.error('Could not start the backend:', error);
    await stop(1);
  });
  backend.once('exit', async (code) => {
    await stop(code ?? 1);
  });
}

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

main().catch(async (error) => {
  console.error('Local backend startup failed:', error);
  await stop(1);
});
