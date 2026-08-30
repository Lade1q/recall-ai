// Tải .env nếu có, không cần dependency (giữ harness chỉ phụ thuộc @google/genai).
// Import file này ĐẦU TIÊN trong mỗi probe để process.env sẵn sàng trước khi tạo client.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // bỏ comment cuối dòng (sau khoảng trắng + #) nếu không nằm trong nháy
    if (!val.startsWith('"') && !val.startsWith("'")) {
      const h = val.indexOf(' #');
      if (h !== -1) val = val.slice(0, h).trim();
    } else {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
