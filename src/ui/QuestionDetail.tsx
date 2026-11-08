import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { allTags, ancestorsOf, childrenOf, interviewName, makeAnchor } from '../lib/model';
import { addQuestion, deleteQuestion, updateQuestion, useAppState } from '../lib/store';
import type { Question } from '../types';
import { AutoTextarea, selectionOffsets, StatusDot, STATUS_LABEL, TagEditor } from './common';
import { go, paths } from './router';

interface Selection {
  start: number;
  end: number;
}

/** 回答テキストを描画する。深掘りの引用箇所を強調し、タップで該当の質問に飛べる */
function AnswerView(props: {
  text: string;
  anchors: { id: string; start: number; end: number }[];
  containerRef: { current: HTMLDivElement | null };
  onOpen(id: string): void;
}) {
  const { text, anchors } = props;
  const parts = useMemo(() => {
    const cuts = new Set<number>([0, text.length]);
    for (const a of anchors) {
      cuts.add(Math.max(0, Math.min(a.start, text.length)));
      cuts.add(Math.max(0, Math.min(a.end, text.length)));
    }
    const sorted = [...cuts].sort((x, y) => x - y);
    const out: { from: number; to: number; ids: string[] }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      out.push({ from, to, ids: anchors.filter((a) => a.start <= from && a.end >= to).map((a) => a.id) });
    }
    return out;
  }, [text, anchors]);

  return (
    <div class="answer-view" ref={props.containerRef}>
      {parts.map((p) =>
        p.ids.length ? (
          <mark
            key={p.from}
            class="hl"
            title="この部分への深掘り質問を開く"
            onClick={() => {
              // 範囲選択の操作中はジャンプしない
              if (window.getSelection()?.isCollapsed === false) return;
              props.onOpen(p.ids[p.ids.length - 1]);
            }}
          >
            {text.slice(p.from, p.to)}
          </mark>
        ) : (
          <span key={p.from}>{text.slice(p.from, p.to)}</span>
        ),
      )}
    </div>
  );
}

function DeepDiveBar(props: { quote: string; onCreate(text: string): void; onCancel(): void; barRef: { current: HTMLDivElement | null } }) {
  const [text, setText] = useState('');
  return (
    <div class="deep-bar" ref={props.barRef} role="region" aria-label="選択範囲から深掘り質問を作る">
      <div class="deep-quote">
        <span class="muted">選択中</span> 「{props.quote.length > 60 ? `${props.quote.slice(0, 60)}…` : props.quote}」
      </div>
      <form
        class="deep-form"
        onSubmit={(e) => {
          e.preventDefault();
          props.onCreate(text.trim());
        }}
      >
        <input
          value={text}
          placeholder="ここについての深掘り質問（空でも作成可）"
          enterkeyhint="done"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn primary">
          深掘りを作る
        </button>
        <button type="button" class="btn" onClick={props.onCancel}>
          ✕
        </button>
      </form>
    </div>
  );
}

export function QuestionDetail({ iid, qid }: { iid: string; qid: string }) {
  const { data } = useAppState();
  const q = data.questions.find((x) => x.id === qid);
  const [mode, setMode] = useState<'view' | 'edit'>(() => (q && q.answer ? 'view' : 'edit'));
  const [sel, setSel] = useState<Selection | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // 閲覧モードの範囲選択を監視する（スマホの長押し選択も selectionchange で拾える）
  useEffect(() => {
    if (mode !== 'view') return;
    const onChange = () => {
      const container = answerRef.current;
      if (!container) return;
      // 深掘り入力欄にフォーカスがある間は、選択が解除されても保持する
      if (barRef.current?.contains(document.activeElement)) return;
      const next = selectionOffsets(container);
      clearTimeout(hideTimer.current);
      if (next) setSel(next);
      else hideTimer.current = setTimeout(() => setSel(null), 250);
    };
    document.addEventListener('selectionchange', onChange);
    // 切り替え直後にすでに選択されていた場合も拾う
    onChange();
    return () => {
      document.removeEventListener('selectionchange', onChange);
      clearTimeout(hideTimer.current);
    };
  }, [mode]);

  if (!q) {
    return (
      <section class="col col-detail">
        <header class="col-head">
          <a class="btn back" href={paths.interview(iid)}>
            ← 質問一覧
          </a>
        </header>
        <div class="col-body">
          <div class="empty">この質問は見つかりません（別の端末で削除された可能性があります）。</div>
        </div>
      </section>
    );
  }

  const interview = data.interviews.find((i) => i.id === q.interviewId);
  const ancestors = ancestorsOf(data.questions, q.id);
  const children = childrenOf(data.questions, q.interviewId, q.id);
  const anchors = children
    .filter((c): c is Question & { anchor: NonNullable<Question['anchor']> } => !!c.anchor && !c.anchor.broken)
    .map((c) => ({ id: c.id, start: c.anchor.start, end: c.anchor.end }));
  const tags = allTags(data.questions).map((t) => t.tag);
  const patch = (p: Partial<Question>) => updateQuestion(q.id, p);

  const quoteFor = (s: Selection) => makeAnchor(q.answer, s.start, s.end);
  const anchor = sel ? quoteFor(sel) : null;

  const createDeepDive = (text: string) => {
    if (!anchor) return;
    const id = addQuestion(q.interviewId, { text, parentId: q.id, anchor });
    window.getSelection()?.removeAllRanges();
    setSel(null);
    go(paths.question(q.interviewId, id));
  };

  const remove = () => {
    const n = children.length;
    const msg = n ? `この質問と、その深掘り質問 ${n} 件以上を削除しますか？` : 'この質問を削除しますか？';
    if (!confirm(msg)) return;
    deleteQuestion(q.id);
    go(q.parentId ? paths.question(q.interviewId, q.parentId) : paths.interview(q.interviewId));
  };

  const fromTextarea = () => {
    const el = textRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return setSel(null);
    setSel({ start: el.selectionStart, end: el.selectionEnd });
  };

  const backHref = q.parentId ? paths.question(q.interviewId, q.parentId) : paths.interview(q.interviewId);

  return (
    <section class="col col-detail" aria-label="質問の詳細">
      <header class="col-head">
        <a class="btn back" href={paths.interview(iid)}>
          ← 質問一覧
        </a>
        <span class="grow muted crumb-company">{interview ? (interview.kind === 'common' ? '📌 共通' : interviewName(interview, '')) : ''}</span>
        <a class={`btn ${q.answer.trim() ? '' : 'disabled'}`} href={q.answer.trim() ? paths.karaoke(q.id) : undefined} aria-disabled={!q.answer.trim()}>
          🎤 カラオケ
        </a>
      </header>

      <div class="col-body detail-body">
        {ancestors.length > 0 && (
          <nav class="crumbs" aria-label="深掘りの経路">
            {ancestors.map((a, idx) => {
              const child = idx + 1 < ancestors.length ? ancestors[idx + 1] : q;
              return (
                <span class="crumb" key={a.id}>
                  <a href={paths.question(a.interviewId, a.id)}>{a.text || '(質問未入力)'}</a>
                  {child.anchor && <span class="crumb-quote">「{child.anchor.quote}」</span>}
                  <span class="muted"> ↳ </span>
                </span>
              );
            })}
          </nav>
        )}

        <AutoTextarea
          class="q-text"
          value={q.text}
          minRows={1}
          placeholder="質問を入力"
          aria-label="質問"
          onInput={(e) => patch({ text: (e.target as HTMLTextAreaElement).value })}
        />

        <div class="meta-row">
          <label class="inline">
            <StatusDot status={q.status} />
            <select
              aria-label="状態"
              value={q.status}
              onChange={(e) => patch({ status: (e.target as HTMLSelectElement).value as Question['status'] })}
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <TagEditor tags={q.tags} suggestions={tags} onChange={(t) => patch({ tags: t })} />
        </div>

        <div class="section-head">
          <h3>回答</h3>
          <div class="seg">
            <button type="button" class={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}>
              選択して深掘り
            </button>
            <button type="button" class={mode === 'edit' ? 'on' : ''} onClick={() => (setSel(null), setMode('edit'))}>
              編集
            </button>
          </div>
        </div>

        {mode === 'edit' ? (
          <>
            <AutoTextarea
              class="answer-edit"
              minRows={6}
              value={q.answer}
              placeholder="回答を書く。書いたあと「選択して深掘り」に切り替え、文字を選ぶとそこから深掘り質問を作れます"
              aria-label="回答"
              onInput={(e) => (setSel(null), patch({ answer: (e.target as HTMLTextAreaElement).value }))}
              onSelect={(e) => {
                textRef.current = e.target as HTMLTextAreaElement;
                fromTextarea();
              }}
            />
            {q.answer.trim() && <p class="hint muted">{q.answer.length} 字 ・ 目安の話す時間 約 {Math.max(1, Math.round(q.answer.length / 5))} 秒</p>}
          </>
        ) : q.answer ? (
          <>
            <AnswerView
              text={q.answer}
              anchors={anchors}
              containerRef={answerRef}
              onOpen={(id) => go(paths.question(q.interviewId, id))}
            />
            <p class="hint muted">
              文字をなぞって選ぶと、そこについての深掘り質問を作れます。
              {anchors.length > 0 && '色が付いた部分は、深掘り質問のある箇所です（タップで開く）。'}
            </p>
          </>
        ) : (
          <p class="muted">回答がまだありません。「編集」から書き始めましょう。</p>
        )}

        <div class="section-head">
          <h3>話す要点</h3>
          <span class="muted small">単語帳の裏面に出ます</span>
        </div>
        <AutoTextarea
          class="points-edit"
          minRows={3}
          value={q.keyPoints}
          placeholder={'1 行 1 項目。例:\n結論: 御社のAI事業に貢献したい\n理由: 大学で画像認識を研究\n具体例: ゼミ長として5人をまとめた'}
          aria-label="話す要点"
          onInput={(e) => patch({ keyPoints: (e.target as HTMLTextAreaElement).value })}
        />

        <div class="section-head">
          <h3>深掘り質問 {children.length > 0 && <span class="count">{children.length}</span>}</h3>
          <button
            type="button"
            class="btn"
            onClick={() => {
              const id = addQuestion(q.interviewId, { parentId: q.id });
              go(paths.question(q.interviewId, id));
            }}
          >
            ＋ 箇所を選ばず追加
          </button>
        </div>
        {children.length === 0 ? (
          <p class="muted">まだありません。</p>
        ) : (
          <ul class="children">
            {children.map((c) => (
              <li key={c.id}>
                <a class="row" href={paths.question(c.interviewId, c.id)}>
                  <StatusDot status={c.status} />
                  <span class="child-main">
                    {c.anchor && (
                      <span class={`quote ${c.anchor.broken ? 'broken' : ''}`}>
                        「{c.anchor.quote.length > 40 ? `${c.anchor.quote.slice(0, 40)}…` : c.anchor.quote}」
                        {c.anchor.broken && '（回答から消えました）'}
                      </span>
                    )}
                    <span>{c.text || '(質問未入力)'}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div class="danger-zone">
          <a class="btn" href={backHref}>
            {q.parentId ? '↑ 親の質問へ' : '↑ 質問一覧へ'}
          </a>
          <button type="button" class="btn danger" onClick={remove}>
            この質問を削除
          </button>
        </div>
      </div>

      {anchor && <DeepDiveBar quote={anchor.quote} barRef={barRef} onCreate={createDeepDive} onCancel={() => (window.getSelection()?.removeAllRanges(), setSel(null))} />}
    </section>
  );
}
