import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)

/** 從鎖定的相依套件建置，避免 ExcelJS 預先打包的瀏覽器檔案夾帶舊版 uuid。 */
export function excelBrowser(): Plugin {
  const id = '\0scamcheck:exceljs'
  return {
    name: 'excel-browser',
    enforce: 'pre',
    config: () => ({ optimizeDeps: { exclude: ['exceljs'] } }),
    resolveId(source) {
      if (source === 'exceljs') return id
    },
    async load(source) {
      if (source !== id) return
      const result = await build({
        entryPoints: [require.resolve('exceljs/lib/exceljs.bare.js')],
        bundle: true,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        write: false,
        plugins: [nodeModulesPolyfillPlugin({
          globals: { Buffer: true, process: true },
          modules: {
            buffer: true, events: true, process: true, stream: true, string_decoder: true, util: true,
            // 網頁只在記憶體產生試算表，未使用本機檔案及工作表密碼保護。
            fs: 'empty', crypto: 'empty',
          },
        })],
      })
      return result.outputFiles[0].text
    },
  }
}
