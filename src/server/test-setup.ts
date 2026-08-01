/**
 * Script tự động thiết lập môi trường trước khi chạy Postman Collection (Study Planner Tests).
 *
 * CHỨC NĂNG:
 * - Đăng nhập tài khoản test mặc định (logintest@example.com) để lấy JWT Access Token mới nhất.
 * - Cập nhật trực tiếp `accessToken` vào file môi trường YAML (`Local Dev.environment.yaml`).
 * - Giúp các bộ test yêu cầu xác thực có thể tự động chạy mà không bị lỗi 401 Unauthorized.
 *
 * SỬ DỤNG:
 * - Chạy tự động trong lệnh: `npm run test:planner` hoặc `npm run test:run`
 */
import fs from 'fs';
import path from 'path';

async function main() {
  const envPath = path.join(__dirname, '../../postman/environments/Local Dev.environment.yaml');
  let envYaml = fs.readFileSync(envPath, 'utf8');

  const port = process.env.PORT || 3001;
  console.log('[test-setup] Logging in to get access token...');
  const res = await fetch(`http://localhost:${port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'logintest@example.com', password: 'SecurePass1' }),
  });

  const json = await res.json();
  if (!json.success || !json.data.accessToken) {
    console.error('[test-setup] Login failed!', json);
    process.exit(1);
  }

  const token = json.data.accessToken;
  console.log('[test-setup] Got access token. Updating environment YAML...');

  // Update accessToken in yaml
  // Pattern:
  // - key: accessToken
  //   value: '...'
  envYaml = envYaml.replace(/(- key: accessToken\n\s+value: )'.*'/g, `$1'${token}'`);
  envYaml = envYaml.replace(/(- key: accessToken\n\s+value: )".*"/g, `$1'${token}'`);
  envYaml = envYaml.replace(/(- key: accessToken\n\s+value: )[^\n'"]+/g, `$1'${token}'`);

  fs.writeFileSync(envPath, envYaml, 'utf8');
  console.log('[test-setup] Environment updated successfully.');
}

main().catch(console.error);
