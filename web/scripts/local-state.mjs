// 本機開發資料（D1 資料庫等）的存放位置。
// Cloudflare 本機模擬器在 Windows 上無法開啟含中文的路徑，所以放在家目錄下的英文資料夾。
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LOCAL_STATE_DIR = process.env.SCAMCHECK_STATE_DIR || join(homedir(), '.scamcheck-local')
