import { useEffect, useState } from 'preact/hooks';
import type { Anchor, Data, Interview, Question, Settings } from '../types';
import { createInterview, createQuestion, descendantIds, emptyData, remapChildAnchors } from './model';
import { mergeData, parseData } from './merge';
import { gradeCard } from './srs';

const DATA_KEY = 'iqa.data.v1';
const SETTINGS_KEY = 'iqa.settings.v1';
const META_KEY = 'iqa.meta.v1';

export type SyncStatus = 'off' | 'idle' | 'pending' | 'syncing' | 'error';
export interface SyncState {
  status: SyncStatus;
  message: string;
  lastSyncedAt: number | null;
}

export interface AppState {
  data: Data;
  settings: Settings;
  sync: SyncState;
  /** データが変更されるたびに増える。同期中の編集検知に使う */
  rev: number;
}

export const DEFAULT_SETTINGS: Settings = {
  token: '',
  gistId: '',
  autoSync: true,
  karaoke: { sensitivity: 1, fontSize: 26, lang: 'ja-JP', autoScroll: true },
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* プライベートモードや容量超過では保存を諦める（画面上の操作は続けられる） */
  }
}

function loadData(): Data {
  try {
    const raw = read<unknown>(DATA_KEY);
    return raw ? parseData(raw) : emptyData();
  } catch {
    return emptyData();
  }
}

function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(SETTINGS_KEY) ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    karaoke: { ...DEFAULT_SETTINGS.karaoke, ...(saved.karaoke ?? {}) },
  };
}

const meta = read<{ lastSyncedAt?: number; dirty?: boolean }>(META_KEY) ?? {};
const initialSettings = loadSettings();

let state: AppState = {
  data: loadData(),
  settings: initialSettings,
  sync: {
    status: initialSettings.token ? (meta.dirty ? 'pending' : 'idle') : 'off',
    message: '',
    lastSyncedAt: meta.lastSyncedAt ?? null,
  },
  rev: 0,
};

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** 変更が Gist に未送信か。同期完了まで true */
let dirty = !!meta.dirty;
let onDataChanged: (() => void) | undefined;

export function getState(): AppState {
  return state;
}

function emit() {
  for (const l of listeners) l();
}

function persistData() {
  write(DATA_KEY, state.data);
  write(META_KEY, { lastSyncedAt: state.sync.lastSyncedAt, dirty });
}

export function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  persistData();
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}

/** sync.ts が「データが変わった」通知を受け取るための登録 */
export function setDataChangeHandler(fn: () => void) {
  onDataChanged = fn;
}

export function isDirty() {
  return dirty;
}

export function markClean() {
  dirty = false;
  write(META_KEY, { lastSyncedAt: state.sync.lastSyncedAt, dirty });
}

function setData(data: Data, opts: { local: boolean }) {
  state = { ...state, data, rev: state.rev + 1 };
  if (opts.local) {
    dirty = true;
    if (state.settings.token && state.sync.status !== 'syncing') {
      state = { ...state, sync: { ...state.sync, status: 'pending' } };
    }
  }
  schedulePersist();
  emit();
  if (opts.local) onDataChanged?.();
}

export function setSyncState(patch: Partial<SyncState>) {
  state = { ...state, sync: { ...state.sync, ...patch } };
  write(META_KEY, { lastSyncedAt: state.sync.lastSyncedAt, dirty });
  emit();
}

/** 同期結果（統合済みデータ）を取り込む。local=false なので未送信扱いにはしない */
export function applyRemoteMerge(remote: Data) {
  const merged = mergeData(state.data, remote);
  setData(merged, { local: false });
}

export function updateSettings(patch: Partial<Settings>) {
  const next = { ...state.settings, ...patch };
  state = { ...state, settings: next };
  write(SETTINGS_KEY, next);
  if (!next.token) state = { ...state, sync: { ...state.sync, status: 'off', message: '' } };
  else if (state.sync.status === 'off') state = { ...state, sync: { ...state.sync, status: dirty ? 'pending' : 'idle' } };
  emit();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAppState(): AppState {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return state;
}

// ---- 変更操作 ---------------------------------------------------------------

const touch = <T extends { updatedAt: number }>(item: T, patch: Partial<T>, now = Date.now()): T => ({
  ...item,
  ...patch,
  updatedAt: now,
});

export function addInterview(init: Partial<Interview> = {}): string {
  const interview = createInterview(init);
  setData({ ...state.data, interviews: [...state.data.interviews, interview] }, { local: true });
  return interview.id;
}

export function updateInterview(id: string, patch: Partial<Interview>) {
  const { data } = state;
  setData(
    { ...data, interviews: data.interviews.map((i) => (i.id === id ? touch(i, patch) : i)) },
    { local: true },
  );
}

export function deleteInterview(id: string) {
  const { data } = state;
  const now = Date.now();
  const deleted = { ...data.deleted, [id]: now };
  const questions = data.questions.filter((q) => {
    if (q.interviewId !== id) return true;
    deleted[q.id] = now;
    return false;
  });
  setData({ ...data, interviews: data.interviews.filter((i) => i.id !== id), questions, deleted }, { local: true });
}

export function addQuestion(
  interviewId: string,
  init: { text?: string; parentId?: string | null; anchor?: Anchor | null } = {},
): string {
  const q = createQuestion(interviewId, {
    text: init.text ?? '',
    parentId: init.parentId ?? null,
    anchor: init.anchor ?? null,
  });
  setData({ ...state.data, questions: [...state.data.questions, q] }, { local: true });
  return q.id;
}

export function updateQuestion(id: string, patch: Partial<Question>) {
  const { data } = state;
  const now = Date.now();
  let questions = data.questions.map((q) => (q.id === id ? touch(q, patch, now) : q));
  if (typeof patch.answer === 'string') {
    questions = remapChildAnchors(questions, id, patch.answer, now);
  }
  setData({ ...data, questions }, { local: true });
}

/** 質問とその深掘り（子孫）をまとめて削除する */
export function deleteQuestion(id: string) {
  const { data } = state;
  const ids = new Set(descendantIds(data.questions, id));
  const now = Date.now();
  const deleted = { ...data.deleted };
  for (const x of ids) deleted[x] = now;
  setData({ ...data, questions: data.questions.filter((q) => !ids.has(q.id)), deleted }, { local: true });
}

export function gradeQuestion(id: string, known: boolean) {
  const { data } = state;
  const now = Date.now();
  setData(
    {
      ...data,
      questions: data.questions.map((q) => (q.id === id ? touch(q, { card: gradeCard(q.card, known) }, now) : q)),
    },
    { local: true },
  );
}

/** JSON の取り込み。既存データとは id 単位で統合する */
export function importData(raw: unknown) {
  const incoming = parseData(raw);
  setData(mergeData(state.data, incoming), { local: true });
}

export function clearLocalData() {
  setData(emptyData(), { local: false });
  dirty = false;
  flushSave();
}
