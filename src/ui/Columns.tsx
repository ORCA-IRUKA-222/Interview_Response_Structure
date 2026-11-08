import { useState } from 'preact/hooks';
import { childrenOf, COMMON_ID, flattenTree, interviewName } from '../lib/model';
import { search } from '../lib/search';
import { addInterview, addQuestion, copyQuestionTree, deleteInterview, updateInterview, useAppState } from '../lib/store';
import { download, toMarkdown } from '../lib/exporter';
import { isDue, todayString } from '../lib/srs';
import type { Interview } from '../types';
import { StatusDot } from './common';
import { go, paths } from './router';

function InterviewRow({ i, selected }: { i: Interview; selected?: string }) {
  const { data } = useAppState();
  const qs = data.questions.filter((q) => q.interviewId === i.id);
  const done = qs.filter((q) => q.status === 'done').length;
  const isCommon = i.kind === 'common';
  return (
    <a href={paths.interview(i.id)} class={`row ${isCommon ? 'common-row' : ''} ${selected === i.id ? 'selected' : ''}`}>
      <span class="row-main">
        <strong>{isCommon ? '📌 共通' : interviewName(i)}</strong>
        {!isCommon && i.company && i.title && <span class="muted"> {i.title}</span>}
      </span>
      <span class="row-sub muted">
        {isCommon ? (
          <span>全面接で使い回す質問 ・ {qs.length} 件</span>
        ) : (
          <>
            {i.date && <span>{i.date}</span>}
            <span class={`badge ${i.stage}`}>{i.stage === 'done' ? '実施済み' : '準備中'}</span>
            <span>
              {done}/{qs.length} 完成
            </span>
          </>
        )}
      </span>
    </a>
  );
}

export function InterviewList({ selected }: { selected?: string }) {
  const { data } = useAppState();
  const common = data.interviews.find((i) => i.id === COMMON_ID);
  const companies = data.interviews
    .filter((i) => i.id !== COMMON_ID)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const create = () => go(paths.interview(addInterview()));
  return (
    <section class="col col-list" aria-label="面接の一覧">
      <header class="col-head">
        <h2>面接</h2>
        <button type="button" class="btn primary" onClick={create}>
          ＋ 会社を追加
        </button>
      </header>
      <div class="col-body">
        {common && (
          <ul class="list common-list">
            <li>
              <InterviewRow i={common} selected={selected} />
            </li>
          </ul>
        )}
        <div class="under-common">
          <p class="group-label muted small">共通の下に、会社ごとの質問を作ります</p>
          {companies.length === 0 && (
            <div class="empty">
              <p>まだ会社（面接）がありません。</p>
              <p class="muted">企業ごと・選考ごとに作り、その中に質問と回答を貯めます。共通の質問は、各社の画面から検索してコピーできます。</p>
              <button type="button" class="btn primary" onClick={create}>
                最初の会社を作る
              </button>
            </div>
          )}
          <ul class="list">
            {companies.map((i) => (
              <li key={i.id}>
                <InterviewRow i={i} selected={selected} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** 会社の画面の中から、共通フォルダの質問を探して開く／この会社にコピーする */
function CommonSearch({ iid }: { iid: string }) {
  const { data } = useAppState();
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const hasCommon = data.questions.some((x) => x.interviewId === COMMON_ID);
  if (!hasCommon) {
    return (
      <p class="muted small common-hint">
        「共通」に質問を入れておくと、ここから検索して、この会社にコピーできます。 <a href={paths.interview(COMMON_ID)}>共通を開く</a>
      </p>
    );
  }
  const terms = q.trim();
  const results = (terms
    ? search(data, terms, undefined, { interviewId: COMMON_ID }).map((h) => h.question)
    : flattenTree(data.questions, COMMON_ID).map((r) => r.question)
  ).slice(0, 30);

  return (
    <details class="common-search">
      <summary>📌 共通の質問から探す</summary>
      <input
        type="search"
        value={q}
        placeholder="共通の質問・回答を検索（空欄で一覧）"
        aria-label="共通の質問を検索"
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      {results.length === 0 ? (
        <p class="muted small">見つかりませんでした。</p>
      ) : (
        <ul class="common-results">
          {results.map((r) => (
            <li key={r.id}>
              <a class="common-q" href={paths.question(COMMON_ID, r.id)} title="共通の質問を開く">
                {r.parentId && <span class="branch">↳ </span>}
                {r.text || '(質問未入力)'}
              </a>
              <button
                type="button"
                class="btn"
                disabled={copied.has(r.id)}
                onClick={() => {
                  // 深掘りも含めて、この会社の質問としてコピーする
                  const id = copyQuestionTree(r.id, iid);
                  setCopied(new Set(copied).add(r.id));
                  void id;
                }}
              >
                {copied.has(r.id) ? '✓ コピー済み' : 'この会社にコピー'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function QuestionTree({ iid, selected }: { iid: string; selected?: string }) {
  const { data } = useAppState();
  const interview = data.interviews.find((i) => i.id === iid);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(() => !!interview && interview.kind !== 'common' && !interview.company && !interview.title);
  if (!interview) {
    return (
      <section class="col col-tree">
        <header class="col-head">
          <a class="btn back" href={paths.home}>
            ← 一覧
          </a>
        </header>
        <div class="col-body">
          <div class="empty">この面接は見つかりません（別の端末で削除された可能性があります）。</div>
        </div>
      </section>
    );
  }

  const rows = flattenTree(data.questions, iid);
  const today = todayString();
  const dueCount = rows.filter(({ question: q }) => (q.answer || q.keyPoints) && isDue(q.card, today)).length;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const id = addQuestion(iid, { text });
    setDraft('');
    go(paths.question(iid, id));
  };

  const remove = () => {
    if (!confirm(`「${interviewName(interview, '無題の面接')}」と、その質問・回答をすべて削除しますか？`)) return;
    deleteInterview(iid);
    go(paths.home);
  };

  return (
    <section class="col col-tree" aria-label="質問の構造">
      <header class="col-head">
        <a class="btn back" href={paths.home}>
          ← 一覧
        </a>
        <h2 class="grow">{interview.kind === 'common' ? '📌 共通' : interviewName(interview)}</h2>
        <button type="button" class="btn" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? '閉じる' : '編集'}
        </button>
      </header>
      <div class="col-body">
        {interview.kind === 'common' && (
          <p class="muted small common-hint">
            ここは全面接で使い回す質問の置き場です。各社の画面の「共通の質問から探す」で検索して、その会社にコピーできます。
          </p>
        )}
        {editing && interview.kind === 'common' && (
          <div class="card form">
            <label>
              メモ
              <textarea
                rows={2}
                value={interview.note}
                onInput={(e) => updateInterview(iid, { note: (e.target as HTMLTextAreaElement).value })}
              />
            </label>
            <div class="form-actions">
              <button
                type="button"
                class="btn"
                onClick={() => download('面接ノート-共通.md', toMarkdown(data, iid), 'text/markdown')}
              >
                Markdown で書き出す
              </button>
            </div>
          </div>
        )}
        {editing && interview.kind !== 'common' && (
          <div class="card form">
            <label>
              企業名
              <input
                value={interview.company}
                onInput={(e) => updateInterview(iid, { company: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              選考（例: 一次面接）
              <input
                value={interview.title}
                onInput={(e) => updateInterview(iid, { title: (e.target as HTMLInputElement).value })}
              />
            </label>
            <div class="form-row">
              <label>
                日付
                <input
                  type="date"
                  value={interview.date}
                  onInput={(e) => updateInterview(iid, { date: (e.target as HTMLInputElement).value })}
                />
              </label>
              <label>
                状態
                <select
                  value={interview.stage}
                  onChange={(e) =>
                    updateInterview(iid, { stage: (e.target as HTMLSelectElement).value as 'preparing' | 'done' })
                  }
                >
                  <option value="preparing">準備中</option>
                  <option value="done">実施済み</option>
                </select>
              </label>
            </div>
            <label>
              メモ
              <textarea
                rows={2}
                value={interview.note}
                onInput={(e) => updateInterview(iid, { note: (e.target as HTMLTextAreaElement).value })}
              />
            </label>
            <div class="form-actions">
              <button
                type="button"
                class="btn"
                onClick={() => download(`面接ノート-${interview.kind === 'common' ? 'common' : interview.company || 'interview'}.md`, toMarkdown(data, iid), 'text/markdown')}
              >
                Markdown で書き出す
              </button>
              <button type="button" class="btn danger" onClick={remove}>
                この面接を削除
              </button>
            </div>
          </div>
        )}

        <form
          class="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={draft}
            placeholder="質問を追加（Enter）"
            enterkeyhint="done"
            aria-label="新しい質問"
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn primary" disabled={!draft.trim()}>
            追加
          </button>
        </form>

        {interview.kind !== 'common' && <CommonSearch iid={iid} />}

        {rows.length > 0 && (
          <div class="study-link">
            <a class="btn" href={paths.study({ iid })}>
              単語帳で覚える{dueCount > 0 && ` (${dueCount})`}
            </a>
          </div>
        )}

        {rows.length === 0 && (
          <div class="empty">
            <p>質問がまだありません。</p>
            <p class="muted">上の入力欄に面接で聞かれそうな質問を入れてみましょう。</p>
          </div>
        )}

        <ul class="tree">
          {rows.map(({ question: q, depth }) => {
            const kids = childrenOf(data.questions, iid, q.id).length;
            return (
              <li key={q.id} style={{ '--depth': depth }}>
                <a href={paths.question(iid, q.id)} class={`row tree-row ${selected === q.id ? 'selected' : ''}`}>
                  <StatusDot status={q.status} />
                  <span class="tree-text">
                    {depth > 0 && <span class="branch" aria-hidden="true">↳ </span>}
                    {q.text || '(質問未入力)'}
                  </span>
                  {kids > 0 && <span class="count" title="深掘り質問の数">{kids}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
