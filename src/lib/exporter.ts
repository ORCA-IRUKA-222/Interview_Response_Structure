import type { Data, Interview, Question } from '../types';
import { flattenTree, interviewName, keyPointLines } from './model';

const STAGE = { preparing: '準備中', done: '実施済み' } as const;
const STATUS = { todo: '未回答', draft: '下書き', done: '完成' } as const;

function interviewMarkdown(interview: Interview, questions: Question[]): string {
  const lines: string[] = [];
  const name =
    interview.kind === 'common'
      ? interviewName(interview)
      : [interview.company, interview.title].filter(Boolean).join(' / ') || '(無題の面接)';
  lines.push(`# ${name}`);
  const meta = [interview.date, STAGE[interview.stage]].filter(Boolean).join(' ・ ');
  lines.push('', `> ${meta}`);
  if (interview.note.trim()) lines.push('', interview.note.trim());

  const numbering = new Map<string | null, number>();
  const labels = new Map<string, string>();

  for (const { question: q, depth } of flattenTree(questions, interview.id)) {
    const n = (numbering.get(q.parentId) ?? 0) + 1;
    numbering.set(q.parentId, n);
    const parentLabel = q.parentId ? labels.get(q.parentId) : undefined;
    const label = parentLabel ? `${parentLabel}-${n}` : `${n}`;
    labels.set(q.id, label);

    const level = Math.min(depth + 2, 6);
    lines.push('', `${'#'.repeat(level)} Q${label}. ${q.text.trim() || '(質問未入力)'}`);

    const info = [STATUS[q.status], ...q.tags.map((t) => `#${t}`)].join(' ');
    lines.push('', `_${info}_`);

    if (q.anchor && q.parentId) {
      lines.push('', `> 深掘り元 Q${parentLabel ?? '?'}: 「${q.anchor.quote}」`);
    }
    if (q.answer.trim()) lines.push('', q.answer.trim());
    const points = keyPointLines(q.keyPoints);
    if (points.length) {
      lines.push('', '**話す要点**', '', ...points.map((p) => `- ${p}`));
    }
  }
  return lines.join('\n') + '\n';
}

export function toMarkdown(data: Data, interviewId?: string): string {
  const targets = interviewId ? data.interviews.filter((i) => i.id === interviewId) : data.interviews;
  return targets.map((i) => interviewMarkdown(i, data.questions)).join('\n---\n\n');
}

export function toJson(data: Data): string {
  return JSON.stringify(data, null, 2);
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
