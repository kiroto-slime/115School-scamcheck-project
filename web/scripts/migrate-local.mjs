// 套用資料庫結構到本機開發用的 D1（npm run dev 會自動先執行）
import { spawnSync } from 'node:child_process'
import { LOCAL_STATE_DIR } from './local-state.mjs'

const r = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', LOCAL_STATE_DIR], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CI: '1' }, // 不要互動式確認
})
process.exit(r.status ?? 1)
