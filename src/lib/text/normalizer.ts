/**
 * 音声認識の結果と原稿を突き合わせるための正規化（発表アシスタント TextNormalizer の移植）。
 *
 * 認識エンジンは同じ発話でも全角/半角、カタカナ/ひらがな、句読点の有無が揺れるため、
 * 比較の前に次を揃える:
 *  - NFKC 正規化（全角英数 → 半角、半角カナ → 全角カナ）
 *  - 半角カナ + 濁点/半濁点の合成（ｶ + ﾞ → が）
 *  - カタカナ → ひらがな、英字は小文字化
 *  - 記号・空白・改行は破棄（文字と数字だけを残す）
 */
export interface NormalizedText {
  /** 比較に使う文字（コードポイント単位） */
  chars: string[];
  /** chars[i] が元テキストの何文字目(UTF-16)に由来するか */
  sourceIndex: number[];
}

const HALFWIDTH_VOICED = 'ﾞ';
const HALFWIDTH_SEMI_VOICED = 'ﾟ';
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function fold(ch: string): string | null {
  if (!LETTER_OR_DIGIT.test(ch) && ch !== 'ー') return null;
  const code = ch.codePointAt(0)!;
  // カタカナ(ァ..ヶ) → ひらがな
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 0x60);
  return ch.toLowerCase();
}

export function normalize(text: string): NormalizedText {
  const chars: string[] = [];
  const sourceIndex: number[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    let unit = String.fromCodePoint(cp);
    let consumed = unit.length;

    // 半角カナは濁点・半濁点が独立した文字で続くため、1 文字に合成してから畳み込む
    const next = text[i + consumed];
    if (next === HALFWIDTH_VOICED || next === HALFWIDTH_SEMI_VOICED) {
      const merged = (unit + next).normalize('NFKC');
      if ([...merged].length === 1) {
        unit += next;
        consumed += 1;
      }
    }

    for (const ch of unit.normalize('NFKC')) {
      const kept = fold(ch);
      if (kept === null) continue;
      chars.push(kept);
      sourceIndex.push(i);
    }
    i += consumed;
  }
  return { chars, sourceIndex };
}

export function normalizeToString(text: string): string {
  return normalize(text).chars.join('');
}
