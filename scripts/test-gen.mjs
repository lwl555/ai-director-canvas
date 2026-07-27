// 自检：用示例数据跑模板生成器，验证 quickapp / platform 两种模式与 zip 合法性。
import { buildAndroidProject } from '../src/lib/androidTemplate.mjs'
import { zipStore } from '../src/lib/zipStore.mjs'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tmp = join(__dirname, '..', '.gen-test')

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJ/3pUAAAAAElFTkSuQmCC'

function writeSample(dir, files) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const t = join(dir, rel)
    mkdirSync(dirname(t), { recursive: true })
    if (typeof content === 'string') writeFileSync(t, content, 'utf8')
    else writeFileSync(t, content)
  }
}

// quickapp + PNG 图标
const qa = buildAndroidProject({
  mode: 'quickapp',
  name: '测试番茄钟',
  packageId: 'com.lingjing.quickapp',
  icon: PNG,
  html: '<!DOCTYPE html><html><body>hi</body></html>',
  seed: 'abc-123'
})
writeSample(join(tmp, 'quickapp'), qa)
const qaZip = zipStore(
  Object.entries(qa).map(([p, d]) => ({
    path: p,
    data: typeof d === 'string' ? new TextEncoder().encode(d) : d
  }))
)
writeFileSync(join(tmp, 'quickapp.zip'), qaZip)

// platform 模式（迷你 dist）
const pf = buildAndroidProject({
  mode: 'platform',
  name: '灵境 AI',
  packageId: 'com.lingjing.platform',
  assetFiles: {
    'index.html': '<!DOCTYPE html><html><body>platform</body></html>',
    'assets/app.js': 'console.log(1)'
  },
  seed: 'platform'
})
writeSample(join(tmp, 'platform'), pf)

console.log('quickapp files:', Object.keys(qa).length)
console.log('quickapp.zip bytes:', qaZip.length)
console.log('platform files:', Object.keys(pf).length)
console.log('sample png icon written:', !!qa['app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'])
