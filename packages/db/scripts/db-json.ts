/**
 * 시연 DB를 표별 JSON 파일로 받아 두고(backup), 같은 파일로 되돌린다(restore).
 *
 *   npx tsx scripts/db-json.ts backup  <폴더>   # 모든 표를 <폴더>/<표이름>.json 으로
 *   npx tsx scripts/db-json.ts restore <폴더>   # 폴더의 JSON으로 DB를 통째로 되돌린다 (먼저 전 표를 비운다)
 *
 * 되돌리기는 한 번에 한다: 외래키 검사를 끄고(session_replication_role=replica, 슈퍼유저 필요 — 내장 DB는 슈퍼유저)
 * 전 표를 비운 뒤 json_populate_recordset 으로 넣는다. 행 수가 다르면 전부 취소한다.
 * 시연 DB 전용이다. 실서비스 DB에는 쓰지 않는다.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const db = new PrismaClient();
const tables = () => Prisma.dmmf.datamodel.models.map((m) => m.name);
const delegate = (name: string) => (db as any)[name.charAt(0).toLowerCase() + name.slice(1)];

async function backup(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  let total = 0;
  let uploads = 0;
  for (const t of tables()) {
    const rows = await delegate(t).findMany();
    const text = JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    uploads += (text.match(/\/uploads\//g) ?? []).length;
    fs.writeFileSync(path.join(dir, `${t}.json`), text, 'utf8');
    total += rows.length;
  }
  console.log(`백업 끝 — ${tables().length}개 표, ${total}행 → ${dir}` + (uploads ? ` · 올린 사진(/uploads/) 참조 ${uploads}곳` : ''));
}

async function restore(dir: string) {
  const names = tables().filter((t) => fs.existsSync(path.join(dir, `${t}.json`)));
  const data = new Map<string, any[]>();
  for (const t of names) data.set(t, JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8')));
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
      await tx.$executeRawUnsafe(`TRUNCATE ${tables().map((t) => `"${t}"`).join(', ')}`);
      for (const t of names) {
        const rows = data.get(t)!;
        if (!rows.length) continue;
        await tx.$executeRawUnsafe(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, JSON.stringify(rows));
      }
      for (const t of names) {
        const n = (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM "${t}"`))[0].n;
        if (n !== data.get(t)!.length) throw new Error(`${t}: 백업 ${data.get(t)!.length}행 ↔ 지금 ${n}행 — 되돌리기 취소`);
      }
    },
    { timeout: 180_000, maxWait: 30_000 },
  );
  console.log(`되돌림 끝 — ${names.length}개 표, ${[...data.values()].reduce((a, b) => a + b.length, 0)}행 ← ${dir}`);
}

(async () => {
  const [mode, dir] = process.argv.slice(2);
  if (!dir || (mode !== 'backup' && mode !== 'restore')) {
    console.error('사용법: npx tsx scripts/db-json.ts backup|restore <폴더>');
    process.exit(2);
  }
  try {
    await (mode === 'backup' ? backup(dir) : restore(dir));
  } catch (e: any) {
    console.error('실패:', String(e?.message ?? e).slice(0, 500));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
})();
