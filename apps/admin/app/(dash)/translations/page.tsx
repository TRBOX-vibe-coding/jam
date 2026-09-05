'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

/** 번역 대상 탭 — API의 I18N_ENTITIES와 일치 */
const TABS: { key: string; label: string }[] = [
  { key: 'drops', label: 'DROP' },
  { key: 'products', label: '상품' },
  { key: 'benefits', label: '혜택' },
  { key: 'merchants', label: '가맹점' },
  { key: 'campaigns', label: '기획전' },
  { key: 'plans', label: '멤버십' },
  { key: 'regions', label: '지역' },
  { key: 'categories', label: '카테고리' },
];

const FIELD_LABEL: Record<string, string> = {
  title: '제목', name: '이름', description: '설명', cancelPolicy: '취소 정책',
  freebieName: '증정품', conditions: '조건', intro: '소개', address: '주소',
  subtitle: '부제', subsidyLabel: '지원 표기',
};

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
] as const;

export default function TranslationsPage() {
  const [tab, setTab] = useState('drops');
  const [data, setData] = useState<{ fields: string[]; labelField: string; rows: any[] } | null>(null);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  // form[lang][field] = 값
  const [form, setForm] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(() => {
    setData(null);
    api<any>(`/admin/i18n/${tab}`).then(setData).catch(() => setData({ fields: [], labelField: 'name', rows: [] }));
  }, [tab]);
  useEffect(load, [load]);

  function openEdit(row: any) {
    const f: Record<string, Record<string, string>> = {};
    for (const l of LANGS) {
      f[l.code] = {};
      for (const field of data!.fields) {
        f[l.code][field] = row.i18n?.[l.code]?.[field] ?? '';
      }
    }
    setForm(f);
    setEditing(row);
  }

  async function save() {
    try {
      await api(`/admin/i18n/${tab}/${editing.id}`, { method: 'PATCH', body: { i18n: form } });
      setMsg('번역 저장 완료 — 앱에 바로 반영됩니다');
      setEditing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  /** 언어별 번역 채움 상태 — 대표 필드 기준 */
  function langStatus(row: any, lang: string) {
    return !!row.i18n?.[lang]?.[data!.labelField];
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">번역 관리</h1>
        {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>

      <p className="text-xs text-ink-3">
        앱에 보이는 콘텐츠의 <b>영어·중국어·일본어</b> 번역을 입력·수정합니다. 저장하면 앱에 바로 반영되고,
        번역이 없는 항목은 한국어 원문이 그대로 나갑니다. (2단계: 점주가 올리면 AI가 자동 번역)
      </p>

      {/* 탭 */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`${TABS.find((t) => t.key === tab)?.label} 번역 (${data?.rows.length ?? '…'})`} />
        {data === null ? (
          <TableSkeleton rows={6} cols={5} />
        ) : data.rows.length === 0 ? (
          <Empty text="번역할 항목이 없습니다" />
        ) : (
          <Table head={['원문 (한국어)', 'EN', '中', '日', '관리']}>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <Td className="max-w-[320px]">
                  <div className="truncate font-medium">{row[data.labelField]}</div>
                  {row.i18n?.en?.[data.labelField] && (
                    <div className="truncate text-xs text-ink-3">{row.i18n.en[data.labelField]}</div>
                  )}
                </Td>
                {LANGS.map((l) => (
                  <Td key={l.code}>
                    {langStatus(row, l.code)
                      ? <Badge>DONE</Badge>
                      : <span className="text-xs text-ink-3">—</span>}
                  </Td>
                ))}
                <Td><Button small variant="ghost" onClick={() => openEdit(row)}>번역 편집</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && data && (
        <Modal title={`번역 편집 — ${editing[data.labelField]}`} onClose={() => setEditing(null)} wide>
          <div className="space-y-5">
            {data.fields.map((field) => (
              editing[field] != null && editing[field] !== '' ? (
                <div key={field}>
                  <div className="mb-1.5 text-xs font-semibold text-ink-3">
                    {FIELD_LABEL[field] ?? field} — <span className="text-ink">원문: {editing[field]}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {LANGS.map((l) => (
                      <div key={l.code}>
                        <label className="mb-0.5 block text-[11px] text-ink-3">{l.label}</label>
                        <input
                          className={inputCls}
                          value={form[l.code]?.[field] ?? ''}
                          onChange={(e) => setForm({ ...form, [l.code]: { ...form[l.code], [field]: e.target.value } })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>취소</Button>
            <Button onClick={save}>저장 (앱 즉시 반영)</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
