import { useEffect, useRef, useState } from 'preact/hooks';
import type { TextareaHTMLAttributes } from 'preact';
import { normalizeTag } from '../lib/model';
import { syncNow } from '../lib/sync';
import { useAppState } from '../lib/store';
import { go, paths } from './router';

/** 内容に合わせて高さが伸びる textarea */
export function AutoTextarea(
  props: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref' | 'value'> & { value: string; minRows?: number },
) {
  const { minRows = 1, class: cls, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} class={cls} {...rest} />;
}

export function TagEditor(props: { tags: string[]; suggestions: string[]; onChange(tags: string[]): void }) {
  const [draft, setDraft] = useState('');
  const listId = useRef(`tags-${Math.random().toString(36).slice(2, 8)}`).current;
  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft('');
    if (tag && !props.tags.includes(tag)) props.onChange([...props.tags, tag]);
  };
  return (
    <div class="tags">
      {props.tags.map((t) => (
        <span class="chip" key={t}>
          #{t}
          <button
            type="button"
            aria-label={`${t} を外す`}
            onClick={() => props.onChange(props.tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        class="tag-input"
        value={draft}
        list={listId}
        placeholder="＋ タグ"
        enterkeyhint="done"
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.isComposing) return;
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && props.tags.length) {
            props.onChange(props.tags.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <datalist id={listId}>
        {props.suggestions
          .filter((s) => !props.tags.includes(s))
          .map((s) => (
            <option value={s} key={s} />
          ))}
      </datalist>
    </div>
  );
}

export const STATUS_LABEL = { todo: '未回答', draft: '下書き', done: '完成' } as const;

export function StatusDot({ status }: { status: keyof typeof STATUS_LABEL }) {
  return <span class={`dot dot-${status}`} title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} />;
}

export function SyncChip() {
  const { sync, settings } = useAppState();
  const time = sync.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '';
  let label = '';
  switch (sync.status) {
    case 'off':
      label = '同期オフ';
      break;
    case 'idle':
      label = `同期済み ${time}`;
      break;
    case 'pending':
      label = '未同期';
      break;
    case 'syncing':
      label = '同期中…';
      break;
    case 'error':
      label = '同期エラー';
      break;
  }
  return (
    <button
      type="button"
      class={`sync sync-${sync.status}`}
      title={sync.message || label}
      onClick={() => (settings.token ? void syncNow() : go(paths.settings))}
    >
      <span class="sync-dot" />
      <span class="sync-label">{label}</span>
    </button>
  );
}

export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onEscape();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
}

/** 範囲選択の開始・終了位置を container のテキスト内オフセットで返す */
export function selectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}

/** タップ位置（折りたたまれたキャレット）のテキスト内オフセット */
export function caretOffset(container: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}
