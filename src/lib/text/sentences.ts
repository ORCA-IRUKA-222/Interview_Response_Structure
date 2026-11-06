/** 原稿を文単位で扱うための境界計算（発表アシスタント Sentences の移植） */

const CLOSING = '」』）)]｝}"”’\'';

function isTerminator(text: string, i: number): boolean {
  switch (text[i]) {
    case '。':
    case '．':
    case '！':
    case '？':
    case '!':
    case '?':
    case '\n':
      return true;
    case '.':
      // 英文のピリオドは小数点や略語と紛らわしいので、空白か末尾が続くときだけ文末とみなす
      return i + 1 >= text.length || /\s/.test(text[i + 1]);
    default:
      return false;
  }
}

/** 文の終端位置（その位置は次の文の先頭）を昇順で返す。最後の要素は必ず text.length */
export function boundaries(text: string): number[] {
  if (text.length === 0) return [0];
  const result: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (!isTerminator(text, i)) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < text.length && CLOSING.includes(text[end])) end++;
    while (end < text.length && /\s/.test(text[end])) end++;
    result.push(end);
    i = end;
  }
  if (result.length === 0 || result[result.length - 1] !== text.length) result.push(text.length);
  return result;
}

export function sentenceStart(b: number[], index: number): number {
  let start = 0;
  for (const x of b) {
    if (x > index) return start;
    start = x;
  }
  return start;
}

export function sentenceEnd(b: number[], index: number): number {
  for (const x of b) if (x > index) return x;
  return b.length ? b[b.length - 1] : 0;
}

export function nextBoundary(b: number[], index: number): number {
  return sentenceEnd(b, index);
}

export function previousBoundary(b: number[], index: number): number {
  let previous = 0;
  for (const x of b) {
    if (x >= index) return previous;
    previous = x;
  }
  return previous;
}
