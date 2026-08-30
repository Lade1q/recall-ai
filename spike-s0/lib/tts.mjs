// TTS tiếng Việt trên Vertex (Gemini TTS) → PCM 16kHz cho p1. Dùng đúng SA/ADC như phần còn lại.
// Đây là công cụ TẠO fixture audio, KHÔNG nằm trong pipeline đo — nội dung câu không ảnh hưởng phép đo latency.
import { makeClient } from './liveClient.mjs';
import { resamplePcm16 } from './resample.mjs';

const TTS_MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = process.env.TTS_VOICE || 'Kore';
const TTS_SRC_RATE = Number(process.env.TTS_SRC_RATE || 24000); // Gemini TTS output

export async function synthesizeVi16k(text) {
  const ai = makeClient();
  const res = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
    },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error(`TTS không trả audio (model=${TTS_MODEL}). Kiểm model name / quyền / responseModalities.`);
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  return resamplePcm16(pcm, TTS_SRC_RATE, 16000);
}
