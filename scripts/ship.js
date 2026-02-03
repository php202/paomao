#!/usr/bin/env node
/**
 * 對 gas 底下每個有 .clasp.json 的專案執行 npm run ship（push + 以既有部署 ID deploy，不變更網址）
 * 使用方式：在 gas 目錄執行 npm run ship
 * 各專案 package.json 的 deploy 腳本須已將 YOUR_DEPLOYMENT_ID 改為該專案既有 Web App 部署 ID
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const gasRoot = path.resolve(__dirname, '..');
const dirs = fs.readdirSync(gasRoot).filter((name) => {
  const full = path.join(gasRoot, name);
  return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '.clasp.json'));
});

console.log('GAS 專案數:', dirs.length);
for (const dir of dirs) {
  const cwd = path.join(gasRoot, dir);
  console.log('\n---', dir, '---');
  try {
    execSync('npm run ship', { cwd, stdio: 'inherit' });
  } catch (e) {
    console.error(dir, 'npm run ship 失敗（請確認該專案 package.json 的 deploy 已填寫既有部署 ID）');
    process.exitCode = 1;
  }
}
console.log('\n完成');
