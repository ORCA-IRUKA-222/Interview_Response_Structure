/** ブラウザの Web Speech API を「止まらない連続認識」として使うラッパー */

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type Ctor = new () => RecognitionLike;

function getCtor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupported(): boolean {
  return !!getCtor();
}

export interface SpeechHandlers {
  onPartial(text: string): void;
  onFinal(text: string): void;
  onRunning(running: boolean): void;
  onError(message: string): void;
}

export class ContinuousRecognizer {
  private rec: RecognitionLike | null = null;
  private wanted = false;
  private failures = 0;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private lang: string,
    private readonly h: SpeechHandlers,
  ) {}

  get running() {
    return this.wanted;
  }

  setLang(lang: string) {
    this.lang = lang;
  }

  start() {
    if (this.wanted) return;
    if (!getCtor()) {
      this.h.onError('このブラウザは音声認識に対応していません（Chrome / Edge / Android の Chrome をお試しください）');
      return;
    }
    this.wanted = true;
    this.failures = 0;
    this.h.onRunning(true);
    this.open();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.restartTimer);
    this.h.onRunning(false);
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* すでに停止している */
      }
    }
  }

  private open() {
    const Ctor = getCtor();
    if (!Ctor || !this.wanted) return;
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      this.failures = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.h.onFinal(r[0].transcript);
        else interim += r[0].transcript;
      }
      this.h.onPartial(interim);
    };

    rec.onerror = (e) => {
      switch (e.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          this.h.onError('マイクの使用が許可されていません。ブラウザの設定で許可してください');
          this.stop();
          break;
        case 'audio-capture':
          this.h.onError('マイクが見つかりません');
          this.stop();
          break;
        case 'network':
          this.failures++;
          this.h.onError('音声認識サーバーに接続できません（オンラインが必要です）');
          break;
        default:
          // no-speech / aborted は無音や切り替えで普通に起きる
          break;
      }
    };

    // 1 回の発話・無音・エラーのたびに止まるので、停止を望んでいない限り聞き直す
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (!this.wanted) return;
      this.failures++;
      const delay = Math.min(250 * 2 ** Math.max(0, this.failures - 2), 4000);
      this.restartTimer = setTimeout(() => this.open(), this.failures > 1 ? delay : 150);
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
      this.failures++;
      this.restartTimer = setTimeout(() => this.open(), 500);
    }
  }
}
