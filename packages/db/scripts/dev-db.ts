/**
 * 개발용 내장 PostgreSQL 실행기 (Windows).
 *
 * 왜 직접 spawn 하는가:
 *  - 이 저장소는 한글 경로("홀릭잼") 아래에 있는데, initdb는 자신의 설치 경로를
 *    부트스트랩 SQL에 그대로 박아 넣는다. 한글 경로가 CP949 바이트로 들어가
 *    UTF8 서버에서 "invalid byte sequence" FATAL이 난다.
 *  - 그래서 postgres 바이너리를 ASCII 경로(%LOCALAPPDATA%\holicgem-pgbin)로
 *    복사한 뒤 그 위치에서 initdb/postgres를 실행한다.
 *
 * 실서비스에서는 이 파일을 쓰지 않고 DATABASE_URL만 운영 DB로 바꾼다.
 *
 * 실행: npm run dev:db -w @holicgem/db
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 5433;
const DB_NAME = 'holicgem';
const DB_USER = 'holicgem';
const DB_PASS = 'holicgem';

const LOCAL = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local');
const BIN_HOME = path.join(LOCAL, 'holicgem-pgbin'); // ASCII 경로로 복사된 바이너리
const DATA_DIR = path.join(LOCAL, 'holicgem-pgdata');
const PW_FILE = path.join(LOCAL, 'holicgem-pgpass.txt');

const SRC_NATIVE = path.join(
  __dirname, '..', '..', '..',
  'node_modules', '@embedded-postgres', 'windows-x64', 'native',
);

const env = { ...process.env, LC_ALL: 'C', LANG: 'C', LC_MESSAGES: 'C' };
const exe = (name: string) => path.join(BIN_HOME, 'bin', `${name}.exe`);

function copyBinariesOnce() {
  const marker = path.join(BIN_HOME, 'bin', 'postgres.exe');
  if (fs.existsSync(marker)) return;
  console.log('[dev-db] copying postgres binaries to ASCII path:', BIN_HOME);
  fs.cpSync(SRC_NATIVE, BIN_HOME, { recursive: true });
}

function initOnce() {
  if (fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) return;
  fs.writeFileSync(PW_FILE, `${DB_PASS}\n`, { encoding: 'ascii' });
  console.log('[dev-db] initdb...');
  const r = spawnSync(
    exe('initdb'),
    [
      '-D', DATA_DIR,
      '-U', DB_USER,
      '-A', 'password',
      `--pwfile=${PW_FILE}`,
      '--locale=C',
      '--encoding=UTF8',
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error(`initdb failed with code ${r.status}`);
  }
  console.log('[dev-db] initdb done');
}

function createDbOnce() {
  const r = spawnSync(
    exe('createdb'),
    ['-h', 'localhost', '-p', String(PORT), '-U', DB_USER, DB_NAME],
    { env: { ...env, PGPASSWORD: DB_PASS }, encoding: 'utf8' },
  );
  if (r.status === 0) console.log(`[dev-db] database "${DB_NAME}" created`);
  else if (/already exists/.test(r.stderr ?? '')) console.log(`[dev-db] database "${DB_NAME}" already exists`);
  else console.warn('[dev-db] createdb:', (r.stderr || '').trim());
}

async function main() {
  copyBinariesOnce();
  initOnce();

  console.log('[dev-db] starting postgres...');
  const server = spawn(
    exe('postgres'),
    ['-D', DATA_DIR, '-p', String(PORT), '-c', 'listen_addresses=127.0.0.1'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let ready = false;
  const onLine = (buf: Buffer) => {
    const line = buf.toString();
    if (!ready && /ready to accept connections/.test(line)) {
      ready = true;
      createDbOnce();
      console.log(`[dev-db] PostgreSQL ready on 127.0.0.1:${PORT}`);
      console.log(`[dev-db] DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:${PORT}/${DB_NAME}`);
      console.log('[dev-db] Ctrl+C to stop');
    }
    if (/FATAL|PANIC/.test(line)) process.stderr.write(line);
  };
  server.stdout.on('data', onLine);
  server.stderr.on('data', onLine);

  server.on('exit', (code) => {
    console.log(`[dev-db] postgres exited with code ${code}`);
    process.exit(code ?? 0);
  });

  const stop = () => {
    console.log('\n[dev-db] stopping...');
    spawnSync(exe('pg_ctl'), ['-D', DATA_DIR, 'stop', '-m', 'fast'], { env });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error('[dev-db] failed:', e);
  process.exit(1);
});
