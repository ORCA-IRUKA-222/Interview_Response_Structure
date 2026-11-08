import { describe, expect, it } from 'vitest';
import { COMMON_ID, copySubtree, createInterview, createQuestion, emptyData, flattenTree, interviewName } from '../src/lib/model';
import { mergeData, parseData, serialize } from '../src/lib/merge';
import { search } from '../src/lib/search';
import { toMarkdown } from '../src/lib/exporter';
import { addQuestion, copyQuestionTree, deleteInterview, getState, updateQuestion } from '../src/lib/store';

const sample = () => {
  const d = emptyData();
  d.interviews.push(
    createInterview({ id: COMMON_ID, kind: 'common', title: '共通', updatedAt: 0 }),
    createInterview({ id: 'acme', company: 'ACME' }),
  );
  d.questions.push(
    createQuestion(COMMON_ID, { id: 'c1', text: '自己紹介をしてください', answer: '大学では情報工学を専攻しました', tags: ['定番'], card: { box: 3, due: '2030-01-01', seen: 4 }, status: 'done' }),
    createQuestion(COMMON_ID, { id: 'c1a', parentId: 'c1', text: '専攻の理由は？', anchor: { start: 4, end: 8, quote: '情報工学' }, answer: '数学が好きだったため' }),
    createQuestion('acme', { id: 'a1', text: 'ACME の志望動機は？', answer: 'AI 事業に魅力を感じました' }),
  );
  return d;
};

describe('共通フォルダ', () => {
  it('表示名: 共通は「共通」、会社は企業名', () => {
    const d = sample();
    expect(interviewName(d.interviews[0])).toBe('共通');
    expect(interviewName(d.interviews[1])).toBe('ACME');
    expect(interviewName(createInterview({}))).toBe('(無題の面接)');
  });

  it('kind は保存・読み込み・統合で保たれる', () => {
    const d = sample();
    const back = parseData(JSON.parse(serialize(d)));
    expect(back.interviews.find((i) => i.id === COMMON_ID)!.kind).toBe('common');
    expect(back.interviews.find((i) => i.id === 'acme')!.kind).toBeUndefined();
    // 別端末が空の「共通」(updatedAt 0) を持っていても、編集済みの方が残る
    const other = emptyData();
    other.interviews.push(createInterview({ id: COMMON_ID, kind: 'common', title: '共通', updatedAt: 0 }));
    const edited = sample();
    edited.interviews[0] = { ...edited.interviews[0], note: '編集済み', updatedAt: 50 };
    expect(mergeData(other, edited).interviews.find((i) => i.id === COMMON_ID)!.note).toBe('編集済み');
    expect(mergeData(edited, other).interviews.find((i) => i.id === COMMON_ID)!.note).toBe('編集済み');
  });

  it('検索は interviewId で共通だけに絞れる（会社の質問は出ない）', () => {
    const d = sample();
    expect(search(d, '専攻').map((h) => h.question.id).sort()).toEqual(['c1', 'c1a']);
    expect(search(d, '志望', undefined, { interviewId: COMMON_ID })).toEqual([]);
    expect(search(d, 'しょうかい', undefined, { interviewId: COMMON_ID })).toEqual([]); // 漢字は別
    expect(search(d, 'ジコ', undefined, { interviewId: COMMON_ID })).toEqual([]);
    expect(search(d, '自己紹介', undefined, { interviewId: COMMON_ID }).map((h) => h.question.id)).toEqual(['c1']);
  });

  it('copySubtree: 深掘りごと別の面接へ。id は新規、引用は保持、学習状態は初期化', () => {
    const d = sample();
    const { copies, rootId } = copySubtree(d.questions, 'c1', 'acme', null, Date.now() + 10);
    expect(copies).toHaveLength(2);
    const root = copies.find((c) => c.id === rootId)!;
    const child = copies.find((c) => c.id !== rootId)!;
    expect(root).toMatchObject({ interviewId: 'acme', parentId: null, anchor: null, text: '自己紹介をしてください', card: { box: 0, due: null, seen: 0 } });
    expect(child).toMatchObject({ interviewId: 'acme', parentId: rootId, text: '専攻の理由は？' });
    expect(child.anchor).toEqual({ start: 4, end: 8, quote: '情報工学' });
    expect(copies.map((c) => c.id).some((id) => ['c1', 'c1a'].includes(id))).toBe(false);
    // 元は変わらない
    expect(d.questions.find((q) => q.id === 'c1')!.card.box).toBe(3);
    // コピー先でツリーとして並ぶ
    const rows = flattenTree([...d.questions, ...copies], 'acme').map((r) => [r.question.text, r.depth]);
    expect(rows).toEqual([['ACME の志望動機は？', 0], ['自己紹介をしてください', 0], ['専攻の理由は？', 1]]);
  });

  it('Markdown の見出しは「共通」', () => {
    expect(toMarkdown(sample(), COMMON_ID)).toContain('# 共通');
  });
});

describe('store（共通の自動作成・保護・コピー）', () => {
  it('起動時から「共通」があり、削除できない', () => {
    expect(getState().data.interviews.some((i) => i.id === COMMON_ID && i.kind === 'common')).toBe(true);
    deleteInterview(COMMON_ID);
    expect(getState().data.interviews.some((i) => i.id === COMMON_ID)).toBe(true);
    expect(getState().data.deleted[COMMON_ID]).toBeUndefined();
  });

  it('共通の質問を会社へコピーでき、元の共通は残る', () => {
    const c = addQuestion(COMMON_ID, { text: '強みは？' });
    updateQuestion(c, { answer: '粘り強さです' });
    const target = 'company-x';
    const copied = copyQuestionTree(c, target);
    const q = getState().data.questions.find((x) => x.id === copied)!;
    expect(q).toMatchObject({ interviewId: target, text: '強みは？', answer: '粘り強さです' });
    expect(getState().data.questions.find((x) => x.id === c)!.interviewId).toBe(COMMON_ID);
  });
});
