// 主程序 APP 打包：把已构建的 dist/ 生成为可构建的 Android 工程。
// 用法：先 `npm run build`，再 `npm run apk:platform`，得到 android-project/ai-director-canvas.android/
//       用 Android Studio 打开该目录 → Build APK(s)。
// 沙箱无 Android SDK，无法在此直接编译 .apk。
import { buildAndroidProject } from '../src/lib/androidTemplate.mjs'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')
const outDir = join(root, 'android-project', 'ai-director-canvas.android')

function walk(dir, base = '') {
  const out = {}
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    const rel = base ? base + '/' + e : e
    if (statSync(full).isDirectory()) Object.assign(out, walk(full, rel))
    else out[rel] = readFileSync(full, 'utf8')
  }
  return out
}

if (!existsSync(distDir)) {
  console.error('未找到 dist/，请先运行 `npm run build` 构建前端。')
  process.exit(1)
}

const assets = walk(distDir)
const files = buildAndroidProject({
  mode: 'platform',
  name: '灵境 AI',
  packageId: 'com.lingjing.platform',
  assetFiles: assets,
  seed: 'platform'
})

let count = 0
for (const [rel, content] of Object.entries(files)) {
  const target = join(outDir, rel)
  mkdirSync(dirname(target), { recursive: true })
  if (typeof content === 'string') writeFileSync(target, content, 'utf8')
  else writeFileSync(target, content)
  count++
}
console.log(`已生成 ${count} 个文件 -> ${outDir}`)
console.log('下一步：用 Android Studio 打开该目录，Build → Build APK(s)。')
