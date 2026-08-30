// Sinh WAV 16kHz mono cho p1 bằng TTS Vertex (self-serve — khỏi cần người ghi âm).
import '../lib/env.mjs';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeWavPcm } from '../lib/wav.mjs';
import { synthesizeVi16k } from '../lib/tts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = process.env.P1_TTS_TEXT || 'Địa chỉ IP lớp B có octet đầu tiên nằm trong khoảng từ một trăm hai tám đến một trăm chín mốt.';
const WAV = process.env.P1_AUDIO_WAV || './fixtures/student-vi-16k.wav';
const outAbs = isAbsolute(WAV) ? WAV : resolve(ROOT, WAV);

async function main() {
  console.log(`TTS Vertex → 16kHz WAV\n  text: "${TEXT}"\n  out : ${outAbs}`);
  const pcm = await synthesizeVi16k(TEXT);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeWavPcm(outAbs, pcm, { sampleRate: 16000, numChannels: 1 });
  console.log(`Đã ghi ${pcm.length} bytes PCM 16kHz (${(pcm.length / 2 / 16000).toFixed(2)}s).`);
}

main().catch((e) => { console.error('gen-wav lỗi:', e); process.exit(2); });
