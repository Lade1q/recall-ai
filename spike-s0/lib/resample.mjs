// Resample PCM 16-bit mono bằng nội suy tuyến tính (đủ cho fixture đo latency).
// Gemini TTS xuất 24kHz; Live input cần 16kHz.
export function resamplePcm16(pcm, srcRate, dstRate) {
  if (srcRate === dstRate) return pcm;
  const inN = Math.floor(pcm.length / 2);
  const outN = Math.floor((inN * dstRate) / srcRate);
  const out = Buffer.alloc(outN * 2);
  const ratio = srcRate / dstRate;
  for (let i = 0; i < outN; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s0 = pcm.readInt16LE(i0 * 2);
    const s1 = i0 + 1 < inN ? pcm.readInt16LE((i0 + 1) * 2) : s0;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac))), i * 2);
  }
  return out;
}
