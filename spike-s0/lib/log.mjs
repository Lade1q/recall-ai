// Transcript hook 2 chiều + log có cấu trúc. Mỗi run ghi 1 file JSONL trong runs/.
// DoD §9 yêu cầu transcript 2 chiều bật từ đầu — Logger.event là nơi đó.
import { mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(here, '..', 'runs');

export class Logger {
  constructor(name) {
    mkdirSync(RUNS, { recursive: true });
    this.t0 = Date.now();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.path = resolve(RUNS, `${name}-${stamp}.jsonl`);
    this.stream = createWriteStream(this.path);
  }

  event(type, data = {}) {
    this.stream.write(JSON.stringify({ t: Date.now() - this.t0, type, ...data }) + '\n');
  }

  // In ra console + ghi file
  note(msg) {
    console.log(msg);
    this.event('note', { msg });
  }

  close() {
    return new Promise((r) => this.stream.end(r));
  }
}
