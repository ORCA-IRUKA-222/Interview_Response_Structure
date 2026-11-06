import type { Data, Interview, Question } from '../types';
import { emptyData } from './model';

function pickNewer<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of a) map.set(item.id, item);
  for (const item of b) {
    const existing = map.get(item.id);
    // 同時刻なら先に入れた側(a)を残す。どちらでも収束するが決定的にしておく
    if (!existing || item.updatedAt > existing.updatedAt) map.set(item.id, item);
  }
  return [...map.values()];
}

/**
 * 2 つの端末のデータを id 単位で統合する。
 *  - 同じ id は updatedAt が新しい方を採用
 *  - 削除は墓標 (deleted) で伝え、削除より後に編集されたものは復活させる
 *  - 親が消えた深掘り質問は孤児になるので落とす
 * 競合ダイアログを出さずに済ませるための純粋関数（可換・冪等）。
 */
export function mergeData(a: Data, b: Data): Data {
  const deleted: Record<string, number> = { ...a.deleted };
  for (const [id, at] of Object.entries(b.deleted)) {
    deleted[id] = Math.max(deleted[id] ?? 0, at);
  }

  const alive = <T extends { id: string; updatedAt: number }>(item: T) =>
    !(deleted[item.id] !== undefined && deleted[item.id] >= item.updatedAt);

  const interviews: Interview[] = pickNewer(a.interviews, b.interviews).filter(alive);
  const interviewIds = new Set(interviews.map((i) => i.id));

  let questions: Question[] = pickNewer(a.questions, b.questions)
    .filter(alive)
    .filter((q) => interviewIds.has(q.interviewId));

  // 親が存在しない質問を、不動点になるまで落とす
  for (;;) {
    const ids = new Set(questions.map((q) => q.id));
    const kept = questions.filter((q) => q.parentId === null || ids.has(q.parentId));
    if (kept.length === questions.length) break;
    questions = kept;
  }

  return { version: 1, interviews, questions, deleted };
}

/** 比較・保存用の決定的な文字列化（並びを id で固定） */
export function serialize(data: Data): string {
  const sortedDeleted = Object.fromEntries(
    Object.entries(data.deleted).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
  );
  return JSON.stringify(
    {
      version: 1,
      interviews: [...data.interviews].sort((x, y) => (x.id < y.id ? -1 : 1)),
      questions: [...data.questions].sort((x, y) => (x.id < y.id ? -1 : 1)),
      deleted: sortedDeleted,
    },
    null,
    1,
  );
}

/** 外から来た JSON を、欠けた項目を補いながら Data に整える。壊れていたら例外 */
export function parseData(raw: unknown): Data {
  if (!raw || typeof raw !== 'object') throw new Error('データの形式が正しくありません');
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.interviews) || !Array.isArray(obj.questions)) {
    throw new Error('interviews / questions が見つかりません');
  }
  const data = emptyData();
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  for (const it of obj.interviews as Record<string, unknown>[]) {
    if (!it || typeof it.id !== 'string') continue;
    data.interviews.push({
      id: it.id,
      title: str(it.title),
      company: str(it.company),
      date: str(it.date),
      stage: it.stage === 'done' ? 'done' : 'preparing',
      note: str(it.note),
      createdAt: num(it.createdAt, 0),
      updatedAt: num(it.updatedAt, 0),
    });
  }
  for (const q of obj.questions as Record<string, unknown>[]) {
    if (!q || typeof q.id !== 'string' || typeof q.interviewId !== 'string') continue;
    const a = q.anchor as Record<string, unknown> | null | undefined;
    const card = (q.card ?? {}) as Record<string, unknown>;
    data.questions.push({
      id: q.id,
      interviewId: q.interviewId,
      parentId: typeof q.parentId === 'string' ? q.parentId : null,
      anchor:
        a && typeof a.start === 'number' && typeof a.end === 'number'
          ? {
              start: a.start,
              end: a.end,
              quote: str(a.quote),
              ...(a.broken ? { broken: true } : {}),
            }
          : null,
      text: str(q.text),
      answer: str(q.answer),
      keyPoints: str(q.keyPoints),
      tags: Array.isArray(q.tags) ? q.tags.filter((t): t is string => typeof t === 'string') : [],
      status: q.status === 'done' || q.status === 'draft' ? q.status : 'todo',
      order: num(q.order, 0),
      card: {
        box: num(card.box, 0),
        due: typeof card.due === 'string' ? card.due : null,
        seen: num(card.seen, 0),
      },
      createdAt: num(q.createdAt, 0),
      updatedAt: num(q.updatedAt, 0),
    });
  }
  if (obj.deleted && typeof obj.deleted === 'object') {
    for (const [id, at] of Object.entries(obj.deleted as Record<string, unknown>)) {
      if (typeof at === 'number') data.deleted[id] = at;
    }
  }
  return data;
}
