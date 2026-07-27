// 生成「主程序原生安卓工程（远程加载版）」并写到桌面，用户可用 Android Studio 打开打包 APK。
// 用法：node scripts/gen-desktop-apk.mjs
// 默认输出：C:/Users/sxiao/Desktop/ai-director-canvas-android/
import { buildRemotePlatformProject } from '../src/lib/androidRemote.mjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
// 桌面路径（Windows）。可用环境变量覆盖：OUT_DIR=... node scripts/gen-desktop-apk.mjs
const outDir =
  process.env.OUT_DIR ||
  'C:/Users/sxiao/Desktop/ai-director-canvas-android'

const files = buildRemotePlatformProject()
let count = 0
for (const [rel, content] of Object.entries(files)) {
  const target = join(outDir, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
  count++
}
console.log(`✅ 已生成 ${count} 个文件 -> ${outDir}`)
console.log('下一步：用 Android Studio 打开该目录 → Build → Build APK(s)')
