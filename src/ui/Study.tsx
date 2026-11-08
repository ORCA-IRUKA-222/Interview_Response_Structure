import { useEffect, useState } from 'preact/hooks';
import { allTags, interviewName, keyPointLines } from '../lib/model';
import { gradeQuestion, useAppState } from '../lib/store';
import { buildDeck, isDue, todayString, type DeckOptions } from '../lib/srs';
import type { Question } from '../types';
import { go, paths } from './router';

function Card({ q, flipped, onFlip }: { q: Question; flipped: boolean; onFlip(): void }) {
  const { data } = useAppState();
  const interview = data.interviews.find((i) => i.id === q.interviewId);
  const parent = q.parentId ? data.questions.find((x) => x.id === q.parentId) : undefined;
  const follow = data.questions.filter((x) => x.parentId === q.id && x.text.trim());
  const points = keyPointLines(q.keyPoints);

  return (
    <div
      class={`flip ${flipped ? 'flipped' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? 'カードを表に戻す' : 'タップして答えを見る'}
      onClick={onFlip}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onFlip();
        }
      }}
    >
      <div class="flip-inner">
        <div class="face front">
          <div class="face-meta muted">
            {interview ? (interview.kind === 'common' ? '📌 共通' : interviewName(interview, '')) : ''}
            {q.tags.map((t) => (
              <span class="chip small" key={t}>
                #{t}
              </span>
            ))}
          </div>
          {parent && q.anchor && (
            <div class="face-context">
              「{q.anchor.quote}」と答えたとき
            </div>
          )}
          <div class="face-q">{q.text}</div>
          <div class="face-hint muted">タップで答えを見る（Space）</div>
        </div>
        <div class="face back">
          <div class="face-qsmall muted">{q.text}</div>
          {points.length > 0 && (
            <>
              <h4>話す要点</h4>
              <ol class="points">
                {points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </>
          )}
          {q.answer.trim() && (
            <>
              <h4>回答</h4>
              <p class="face-answer">{q.answer}</p>
            </>
          )}
          {follow.length > 0 && (
            <>
              <h4>想定される深掘り</h4>
              <ul class="follow">
                {follow.map((f) => (
                  <li key={f.id}>
                    {f.anchor && <span class="muted">「{f.anchor.quote}」→ </span>}
                    {f.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Study({ iid, tag }: { iid?: string; tag?: string }) {
  const { data } = useAppState();
  const [opts, setOpts] = useState<DeckOptions>({
    interviewId: iid,
    tag,
    includeDeepDives: true,
    onlyDue: false,
    shuffle: false,
  });
  const [deckIds, setDeckIds] = useState<string[]>(() => buildDeck(data.questions, opts).map((q) => q.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const rebuild = (next: DeckOptions) => {
    setOpts(next);
    setDeckIds(buildDeck(data.questions, next).map((q) => q.id));
    setIndex(0);
    setFlipped(false);
  };

  const byId = new Map(data.questions.map((q) => [q.id, q]));
  const deck = deckIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);
  const current = deck[index];
  const finished = deck.length > 0 && index >= deck.length;
  const today = todayString();
  const dueTotal = data.questions.filter((q) => (q.answer || q.keyPoints) && isDue(q.card, today)).length;

  const move = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(deck.length, i + delta)));
    setFlipped(false);
  };
  const grade = (known: boolean) => {
    if (!current) return;
    gradeQuestion(current.id, known);
    move(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === ' ' && current && !t.closest('button, [role=button]')) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tags = allTags(data.questions);

  return (
    <main class="page study">
      <div class="page-head">
        <a class="btn back" href={iid ? paths.interview(iid) : paths.home}>
          ← 戻る
        </a>
        <h2 class="grow">単語帳</h2>
        <span class="muted small">今日の復習 {dueTotal} 枚</span>
      </div>

      <details class="filters-wrap" open={typeof window !== 'undefined' && window.innerWidth >= 900}>
        <summary>絞り込み・出題設定</summary>
        <div class="filters">
        <label>
          面接
          <select
            value={opts.interviewId ?? ''}
            onChange={(e) => rebuild({ ...opts, interviewId: (e.target as HTMLSelectElement).value || undefined })}
          >
            <option value="">すべて</option>
            {data.interviews.map((i) => (
              <option value={i.id} key={i.id}>
                {i.kind === 'common' ? '📌 共通' : interviewName(i, '(無題)')}
              </option>
            ))}
          </select>
        </label>
        <label>
          タグ
          <select value={opts.tag ?? ''} onChange={(e) => rebuild({ ...opts, tag: (e.target as HTMLSelectElement).value || undefined })}>
            <option value="">すべて</option>
            {tags.map((t) => (
              <option value={t.tag} key={t.tag}>
                #{t.tag} ({t.count})
              </option>
            ))}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" checked={opts.includeDeepDives} onChange={(e) => rebuild({ ...opts, includeDeepDives: (e.target as HTMLInputElement).checked })} />
          深掘りも含める
        </label>
        <label class="check">
          <input type="checkbox" checked={opts.onlyDue} onChange={(e) => rebuild({ ...opts, onlyDue: (e.target as HTMLInputElement).checked })} />
          復習が必要なものだけ
        </label>
        <label class="check">
          <input type="checkbox" checked={opts.shuffle} onChange={(e) => rebuild({ ...opts, shuffle: (e.target as HTMLInputElement).checked })} />
          シャッフル
        </label>
        </div>
      </details>

      {deck.length === 0 ? (
        <div class="empty">
          <p>カードがありません。</p>
          <p class="muted">質問に「回答」か「話す要点」を入力すると、単語帳に出てきます。</p>
        </div>
      ) : finished ? (
        <div class="empty done">
          <h3>おつかれさま 🎉</h3>
          <p class="muted">{deck.length} 枚を確認しました。</p>
          <button type="button" class="btn primary" onClick={() => rebuild(opts)}>
            もう一周する
          </button>
          <button type="button" class="btn" onClick={() => go(paths.home)}>
            ホームへ
          </button>
        </div>
      ) : (
        current && (
          <>
            <div class="progress-line muted small">
              {index + 1} / {deck.length}
              <span class="bar">
                <span style={{ width: `${(index / deck.length) * 100}%` }} />
              </span>
            </div>
            <Card key={current.id} q={current} flipped={flipped} onFlip={() => setFlipped(!flipped)} />
            <div class="study-actions">
              <button type="button" class="btn" onClick={() => move(-1)} disabled={index === 0} aria-label="前のカード">
                ←
              </button>
              {flipped ? (
                <>
                  <button type="button" class="btn again" onClick={() => grade(false)}>
                    もう一度
                  </button>
                  <button type="button" class="btn primary" onClick={() => grade(true)}>
                    言えた
                  </button>
                </>
              ) : (
                <button type="button" class="btn primary wide" onClick={() => setFlipped(true)}>
                  答えを見る
                </button>
              )}
              <button type="button" class="btn" onClick={() => move(1)} aria-label="次のカード">
                →
              </button>
            </div>
            <div class="center">
              <a class="muted small" href={paths.question(current.interviewId, current.id)}>
                この質問を編集
              </a>
            </div>
          </>
        )
      )}
    </main>
  );
}
