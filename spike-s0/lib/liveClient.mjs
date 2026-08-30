// Wrapper WS Live trên Vertex. Nối bằng service-account/ADC (KHÔNG mint token client — quy tắc g).
// Gom message theo TURN; tự trả lời tool để model không bị chặn; phát event cho probe.
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { EventEmitter } from 'node:events';

export { Modality, Type };

export function makeClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  if (!project || project.startsWith('<')) {
    throw new Error('GOOGLE_CLOUD_PROJECT chưa set — copy .env.example -> .env và điền (xem README).');
  }
  // vertexai:true + ADC (GOOGLE_APPLICATION_CREDENTIALS) => auth bằng service account.
  return new GoogleGenAI({ vertexai: true, project, location });
}

export const LIVE_MODEL = () => process.env.LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

export class LiveSession extends EventEmitter {
  // toolScheduling chỉ có tác dụng khi declaration đặt behavior: NON_BLOCKING.
  //   'SILENT'    -> ghi nhận, không cắt lời, không surface cho model (nhánh A).
  //   'WHEN_IDLE' -> model được nói câu chuyển rồi mới tiếp (nhánh B, non-silent retry).
  //   'INTERRUPT' -> chèn ngay (không dùng cho evidence).
  constructor(logger, { toolScheduling = 'SILENT' } = {}) {
    super();
    this.logger = logger;
    this.session = null;
    this.closeInfo = null;
    this.errorInfo = null;
    this.toolScheduling = toolScheduling;
    this.interruptedCount = 0;
    this._newTurn();
  }

  _newTurn() {
    this.turn = { audioChunks: 0, audioBytes: 0, toolCalls: [], outText: '', inText: '', spoke: false };
  }

  async open({ ai, model, config }) {
    this.session = await ai.live.connect({
      model,
      config,
      callbacks: {
        onopen: () => this.logger?.event('open', { model }),
        onmessage: (m) => this._onMessage(m),
        onerror: (e) => {
          this.errorInfo = e?.message || String(e);
          this.logger?.event('ws-error', { message: this.errorInfo });
          this.emit('ws-error', this.errorInfo);
        },
        onclose: (e) => {
          this.closeInfo = { code: e?.code ?? null, reason: e?.reason ?? '' };
          this.logger?.event('close', this.closeInfo);
          this.emit('closed', this.closeInfo);
        },
      },
    });
    return this;
  }

  _onMessage(m) {
    const sc = m.serverContent;
    if (sc) {
      if (sc.inputTranscription?.text) {
        this.turn.inText += sc.inputTranscription.text;
        this.logger?.event('input-transcript', { text: sc.inputTranscription.text });
      }
      if (sc.outputTranscription?.text) {
        this.turn.outText += sc.outputTranscription.text;
        this.logger?.event('output-transcript', { text: sc.outputTranscription.text });
      }
      for (const p of sc.modelTurn?.parts || []) {
        if (p.inlineData?.data) {
          const bytes = Buffer.from(p.inlineData.data, 'base64').length;
          this.turn.audioChunks++;
          this.turn.audioBytes += bytes;
          this.turn.spoke = true;
          this.emit('audio', { bytes, at: Date.now(), b64: p.inlineData.data });
        } else if (p.text) {
          this.turn.outText += p.text;
        }
      }
      if (sc.interrupted) {
        this.interruptedCount++;
        this.logger?.event('interrupted', {});
        this.emit('interrupted', {});
      }
      if (sc.turnComplete) {
        const t = this.turn;
        this.logger?.event('turn-complete', {
          audioChunks: t.audioChunks,
          audioBytes: t.audioBytes,
          toolCalls: t.toolCalls.length,
          spoke: t.spoke,
        });
        this.emit('turn', t);
        this._newTurn();
      }
    }

    if (m.toolCall?.functionCalls?.length) {
      for (const fc of m.toolCall.functionCalls) {
        const rec = {
          id: fc.id ?? null,
          name: fc.name,
          args: fc.args ?? {},
          at: Date.now(),
          spokeBefore: this.turn.spoke, // model đã phát audio trước khi bắn tool? (SILENT nếu false)
        };
        this.turn.toolCalls.push(rec);
        this.logger?.event('toolcall', rec);
        this.emit('toolcall', rec);
      }
      this._respondTools(m.toolCall.functionCalls);
    }
  }

  _respondTools(fcs) {
    try {
      this.session.sendToolResponse({
        functionResponses: fcs.map((fc) => ({
          id: fc.id,
          name: fc.name,
          response: { result: 'ok' },
          scheduling: this.toolScheduling, // chỉ áp dụng khi behavior=NON_BLOCKING
        })),
      });
    } catch (e) {
      this.logger?.event('toolresponse-error', { message: e?.message });
    }
  }

  // --- gửi ---
  sendText(text) {
    this.logger?.event('sent-text', { text });
    this.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
  }

  activityStart() {
    this.logger?.event('activity-start', {});
    this.session.sendRealtimeInput({ activityStart: {} });
  }

  sendAudio(b64, rate = 16000) {
    this.session.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${rate}` } });
  }

  activityEnd() {
    this.logger?.event('activity-end', {});
    this.session.sendRealtimeInput({ activityEnd: {} });
  }

  // --- chờ ---
  waitForTurn(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const onTurn = (t) => { cleanup(); resolve(t); };
      const onClosed = (info) => { cleanup(); reject(Object.assign(new Error(`đóng giữa turn (code=${info.code})`), { closeInfo: info })); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`turn timeout ${timeoutMs}ms`)); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.off('turn', onTurn); this.off('closed', onClosed); };
      this.once('turn', onTurn);
      this.once('closed', onClosed);
    });
  }

  waitForFirstAudio(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const onAudio = (a) => { cleanup(); resolve(a.at); };
      const onClosed = (info) => { cleanup(); reject(new Error(`đóng trước khi có audio (code=${info.code})`)); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`không nhận audio sau ${timeoutMs}ms`)); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.off('audio', onAudio); this.off('closed', onClosed); };
      this.once('audio', onAudio);
      this.once('closed', onClosed);
    });
  }

  close() {
    try { this.session?.close(); } catch { /* noop */ }
  }
}
