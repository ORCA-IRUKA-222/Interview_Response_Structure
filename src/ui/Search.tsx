import { useMemo, useState } from 'preact/hooks';
import { allTags, COMMON_ID, interviewName } from '../lib/model';
import { search } from '../lib/search';
import { useAppState } from '../lib/store';
import { StatusDot } from './common';
import { paths, replace } from './router';

const FIELD_LABEL = { text: '質問', answer: '回答', keyPoints: '要点', tags: 'タグ', interview: '面接' } as const;

export function Search({ q: initialQ, tag: initialTag }: { q: string; tag?: string }) {
  const { data } = useAppState();
  const [q, setQ] = useState(initialQ);
  const [tag, setTag] = useState<string | undefined>(initialTag);
  const [commonOnly, setCommonOnly] = useState(false);
  const tags = allTags(data.questions);
  const hits = useMemo(
    () => search(data, q, tag, commonOnly ? { interviewId: COMMON_ID } : {}),
    [data, q, tag, commonOnly],
  );

  const update = (nextQ: string, nextTag: string | undefined) => {
    setQ(nextQ);
    setTag(nextTag);
    replace(paths.search(nextQ, nextTag));
  };

  return (
    <main class="page">
      <div class="page-head">
        <a class="btn back" href={paths.home}>
          ← ホーム
        </a>
        <h2 class="grow">検索</h2>
      </div>
      <input
        class="search-input"
        type="search"
        autofocus
        value={q}
        placeholder="質問・回答・要点・タグを検索（空白で AND）"
        aria-label="検索語"
        onInput={(e) => update((e.target as HTMLInputElement).value, tag)}
      />
      <label class="check scope-check">
        <input type="checkbox" checked={commonOnly} onChange={(e) => setCommonOnly((e.target as HTMLInputElement).checked)} />
        共通の質問だけ検索する
      </label>
      {tags.length > 0 && (
        <div class="tags filter-tags">
          {tags.map((t) => (
            <button
              type="button"
              key={t.tag}
              class={`chip ${tag === t.tag ? 'on' : ''}`}
              aria-pressed={tag === t.tag}
              onClick={() => update(q, tag === t.tag ? undefined : t.tag)}
            >
              #{t.tag} <span class="muted">{t.count}</span>
            </button>
          ))}
        </div>
      )}
      {!q.trim() && !tag ? (
        <p class="muted">検索語を入れるか、タグを選んでください。全角/半角、ひらがな/カタカナ、大文字/小文字は区別しません。</p>
      ) : hits.length === 0 ? (
        <p class="muted">見つかりませんでした。</p>
      ) : (
        <>
          <p class="muted small">{hits.length} 件</p>
          <ul class="list results">
            {hits.map((h) => (
              <li key={h.question.id}>
                <a class="row" href={paths.question(h.question.interviewId, h.question.id)}>
                  <span class="row-main">
                    <StatusDot status={h.question.status} /> {h.question.text || '(質問未入力)'}
                  </span>
                  <span class="row-sub muted">
                    <span class={`badge ${h.interview.kind === 'common' ? 'common' : ''}`}>
                      {h.interview.kind === 'common' ? '📌 共通' : interviewName(h.interview, '')}
                    </span>
                    {h.field !== 'text' && (
                      <span>
                        {FIELD_LABEL[h.field]}: {h.snippet}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
