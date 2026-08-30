// WAV tối giản: đọc PCM 16-bit từ WAV (cho p1) và ghi PCM ra WAV (lưu audio model để nghe).
import { readFileSync, writeFileSync } from 'node:fs';

export function readWavPcm(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} không phải WAV hợp lệ`);
  }
  let off = 12;
  let fmt = null;
  let dataOff = -1;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        numChannels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataOff = body;
      dataLen = size;
    }
    off = body + size + (size % 2); // chunk padding chẵn
  }
  if (!fmt || dataOff < 0) throw new Error('WAV thiếu chunk fmt/data');
  if (fmt.bitsPerSample !== 16) throw new Error('Cần PCM 16-bit');
  return { ...fmt, pcm: buf.subarray(dataOff, dataOff + dataLen) };
}

export function writeWavPcm(path, pcm, { sampleRate = 24000, numChannels = 1 } = {}) {
  const byteRate = sampleRate * numChannels * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(numChannels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([header, pcm]));
}
