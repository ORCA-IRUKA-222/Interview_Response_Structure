import { describe, expect, it } from 'vitest';
import { ScriptAligner, ALIGNER_PRESETS } from '../src/lib/text/aligner';
import { normalizeToString } from '../src/lib/text/normalizer';
import { SpeechBuffer } from '../src/lib/text/speechBuffer';
import { boundaries, sentenceStart, sentenceEnd } from '../src/lib/text/sentences';

const SCRIPT =
  '私は大学で情報工学を専攻し、画像認識の研究に取り組みました。' +
  'ゼミでは五人のチームをまとめ、週次で進捗を共有する仕組みを作りました。' +
  'その結果、学会発表で優秀賞をいただくことができました。' +
  '御社ではこの経験を活かし、データ活用で事業に貢献したいと考えています。';

describe('normalizer', () => {
  it('全角半角・かなカナ・記号を畳み込む', () => {
    expect(normalizeToString('ＡＢＣ　１２３、カタカナ！')).toBe('abc123かたかな');
    expect(normalizeToString('ｶﾞｲﾄﾞ')).toBe('がいど');
    expect(normalizeToString('コーヒー')).toBe('こーひー');
  });
});

describe('sentences', () => {
  it('文の境界を求める', () => {
    const b = boundaries('これは一文目です。二文目！ 三文目');
    expect(b).toEqual([9, 14, 17]);
    expect(sentenceStart(b, 9)).toBe(9);
    expect(sentenceEnd(b, 9)).toBe(14);
  });
});

describe('ScriptAligner', () => {
  it('音声認識のゆれを含む読み通しで最後まで追従する', () => {
    const a = new ScriptAligner(SCRIPT);
    const spoken = [
      'わたしは大学で情報工学を専攻し',
      '画像認識の研究に取り組みました',
      'ゼミでは五人のチームをまとめ週次で進捗を共有する仕組みを作りました',
      'その結果学会発表で優秀賞をいただく事ができました',
      '御社ではこの経験を生かしデータ活用で事業に貢献したいと考えています',
    ];
    const buffer = new SpeechBuffer();
    let previous = 0;
    for (const s of spoken) {
      buffer.commit(s);
      a.consume(buffer.current());
      expect(a.cursor).toBeGreaterThanOrEqual(previous);
      previous = a.cursor;
    }
    expect(a.progress()).toBeGreaterThan(0.95);
  });

  it('読み飛ばしに追いつき、原稿にない雑談では動かない', () => {
    const a = new ScriptAligner(SCRIPT);
    expect(a.consume('今日はいい天気ですね。ところで昨日のサッカー見ました？')).toBe(false);
    expect(a.cursor).toBe(0);
    a.consume('その結果学会発表で優秀賞をいただくことができました');
    expect(a.readBoundaryInSource()).toBeGreaterThan(SCRIPT.indexOf('その結果'));
  });

  it('位置は前進のみで、手動のシークと感度プリセットが効く', () => {
    const a = new ScriptAligner(SCRIPT, ALIGNER_PRESETS[0]);
    a.seekToSource(SCRIPT.indexOf('ゼミでは'));
    const at = a.cursor;
    expect(a.consume('私は大学で情報工学を専攻し')).toBe(false);
    expect(a.cursor).toBe(at);
    a.finish();
    expect(a.isFinished).toBe(true);
    expect(a.readBoundaryInSource()).toBe(SCRIPT.length);
  });
});
