// 把已验证的远程加载安卓工程写出到仓库 android/（供 GitHub Actions 云端构建 APK）。
// 关键增强：MainActivity 优先加载 assets/quickapp.html（单个快应用打包模式），
// 不存在时回退到远程站点（平台壳模式）。两套 APK 共用同一份工程，由资源是否存在决定行为。
import { buildRemotePlatformProject } from '../src/lib/androidRemote.mjs'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'android')

// 清理旧产物，保证幂等
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const HOME = 'https://lwl555.github.io/ai-director-canvas/'
const files = buildRemotePlatformProject()

// 给 MainActivity 加上「本地 quickapp.html 优先」的分支
const mainKey = Object.keys(files).find((k) => k.endsWith('MainActivity.java'))
if (!mainKey) throw new Error('找不到 MainActivity.java')
files[mainKey] = files[mainKey].replace(
  `wv.loadUrl("${HOME}");`,
  `// 若 assets/quickapp.html 存在（单个快应用打包模式），加载本地；否则加载远程站点（平台壳模式）
        try {
            getAssets().open("quickapp.html").close();
            wv.loadUrl("file:///android_asset/quickapp.html");
        } catch (java.io.IOException e) {
            wv.loadUrl("${HOME}");
        }`
)

for (const [rel, content] of Object.entries(files)) {
  const full = join(OUT, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content, 'utf8')
}

console.log(`已写出 ${Object.keys(files).length} 个文件到 android/`)
