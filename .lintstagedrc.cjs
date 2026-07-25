const path = require('path');

// Dùng JS entry point trực tiếp thay vì .bin wrappers (bash script, không chạy được trên Windows)
const clientEslint = path.join(
  __dirname,
  'src',
  'client',
  'node_modules',
  'eslint',
  'bin',
  'eslint.js'
);
const serverEslint = path.join(
  __dirname,
  'src',
  'server',
  'node_modules',
  'eslint',
  'bin',
  'eslint.js'
);
const prettier = path.join(__dirname, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

module.exports = {
  // TypeScript/TSX files của FE: dùng eslint của client + prettier của root
  'src/client/**/*.{ts,tsx}': (files) => {
    const fileList = files.map((f) => `"${f}"`).join(' ');
    return [`node "${clientEslint}" --fix ${fileList}`, `node "${prettier}" --write ${fileList}`];
  },
  // TypeScript files của BE: dùng eslint của server + prettier của root
  'src/server/**/*.ts': (files) => {
    const fileList = files.map((f) => `"${f}"`).join(' ');
    return [`node "${serverEslint}" --fix ${fileList}`, `node "${prettier}" --write ${fileList}`];
  },
  // Config/docs files: chỉ cần prettier
  '**/*.{json,md,yaml,yml}': (files) => {
    const fileList = files.map((f) => `"${f}"`).join(' ');
    return [`node "${prettier}" --write ${fileList}`];
  },
};
