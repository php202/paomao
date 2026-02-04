#!/usr/bin/env node
/**
 * 對 gas 底下每個有 .clasp.json 的專案執行 npm run ship（push + 以既有部署 ID deploy，不變更網址）
 * 使用方式：
 *   npm run ship                     → 全部專案
 *   npm run ship -- "泡泡貓 員工打卡 Line@"  → 只 ship 指定專案（可多個，避免配額用盡時可只更新有改的）
 * 各專案 package.json 的 deploy 腳本須已將 YOUR_DEPLOYMENT_ID 改為該專案既有 Web App 部署 ID
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const gasRoot = path.resolve(__dirname, '..');

// 單一真相來源：PaoMao_Core 的 deploy -i 必須與 DEPLOY.md「固定 Core API 部署」的 ID 一致，否則會更新到錯誤的部署（非網路應用程式）
const deployMdPath = path.join(gasRoot, 'DEPLOY.md');
const corePkgPath = path.join(gasRoot, 'PaoMao_Core', 'package.json');
if (fs.existsSync(deployMdPath) && fs.existsSync(corePkgPath)) {
  const deployMd = fs.readFileSync(deployMdPath, 'utf8');
  const coreIdMatch = deployMd.match(/\*\*Deployment ID\*\*[：:]\s*`(AKfycb[a-zA-Z0-9_-]+)`/);
  const expectedId = coreIdMatch ? coreIdMatch[1] : null;
  const corePkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));
  const deployCmd = (corePkg.scripts && corePkg.scripts.deploy) || '';
  const actualIdMatch = deployCmd.match(/clasp deploy -i (\S+)/);
  const actualId = actualIdMatch ? actualIdMatch[1] : null;
  if (expectedId && actualId && actualId !== expectedId) {
    console.error('【ship 中止】PaoMao_Core 的 deploy -i 與 DEPLOY.md「固定 Core API 部署」不一致。');
    console.error('  package.json deploy -i：', actualId);
    console.error('  DEPLOY.md 應為：      ', expectedId);
    console.error('請改為「管理部署」中類型「網路應用程式」、URL 結尾 /exec 的那筆部署 ID（見 DEPLOY.md）。');
    process.exit(1);
  }
}

// 跑 ship 前檢查：本機 Core API 說明必須是「網路應用程式」
const coreWebAppPath = path.join(gasRoot, 'PaoMao_Core', 'CoreWebApp.js');
if (fs.existsSync(coreWebAppPath)) {
  const content = fs.readFileSync(coreWebAppPath, 'utf8').slice(0, 2000);
  const hasWebApp = /網路應用程式/.test(content);
  const urlBlock = content.match(/PAO_CAT_CORE_API_URL[\s\S]*?（[\s\S]*?）/);
  const urlSaysLibrary = urlBlock && /程式庫|Library/.test(urlBlock[0]);
  if (!hasWebApp || urlSaysLibrary) {
    console.error('【ship 中止】本機 PaoMao_Core 的 Core API 說明缺少「網路應用程式」或含錯誤用語。');
    console.error('請勿執行 clasp pull，並以 DEPLOY.md 為準將相關註解改為「網路應用程式」後再 ship。');
    process.exit(1);
  }
}

let dirs = fs.readdirSync(gasRoot).filter((name) => {
  const full = path.join(gasRoot, name);
  return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '.clasp.json'));
});

const filterNames = process.argv.slice(2).filter(Boolean);
if (filterNames.length > 0) {
  dirs = dirs.filter((d) => filterNames.includes(d));
  if (dirs.length === 0) {
    console.error('未找到符合的專案。可用的專案：', fs.readdirSync(gasRoot).filter((name) => {
      const full = path.join(gasRoot, name);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '.clasp.json'));
    }).join(', '));
    process.exit(1);
  }
  console.log('只 ship 指定專案:', dirs.join(', '));
}

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
