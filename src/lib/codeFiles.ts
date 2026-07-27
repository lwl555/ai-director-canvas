// 从 AI 回复中解析「多文件项目」代码块，汇入平台「文件区域」。
// ---------------------------------------------------------------
// 支持的两种格式（模型按指示输出，平台自动收集成可浏览/可下载的工程）：
//
// 1) 围栏代码块，info 串为 `lang:path/to/file.ext`
//    ```js:src/server.js
//    ...
//    ```
// 2) 显式文件标记（更稳，适合大模型）
//    ===FILE: src/index.html===
//    ...
//    ===END===
//
// 解析结果按 path 去重（同路径后者覆盖前者），便于多次补充后保持最新。

export interface ProjectFile {
  path: string
  lang: string
  code: string
}

// lang:path 中 path 是否像「文件路径」（含 / 或以常见扩展名结尾）
const PATH_LIKE = /(\/|\\|\.[a-z0-9]{1,6}$)/i

// 围栏块：`lang:path` 或 `lang`
const FENCE = /```([^\n`]*)\n([\s\S]*?)```/gi
// 显式标记块
const MARKER = /===FILE:\s*([^\n]+?)\s*===([\s\S]*?)===END===/gi

function langFromPath(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'txt'
}

/** 解析单段文本里的全部文件块 */
export function parseProjectFiles(content: string): ProjectFile[] {
  const out: ProjectFile[] = []

  // 1) 围栏块
  let m: RegExpExecArray | null
  FENCE.lastIndex = 0
  while ((m = FENCE.exec(content))) {
    const info = m[1].trim()
    const code = m[2].replace(/\n+$/, '')
    // info 形如 `js:src/x.js` 或 `js`
    const sep = info.indexOf(':')
    if (sep > 0) {
      const maybeLang = info.slice(0, sep).trim().toLowerCase()
      const maybePath = info.slice(sep + 1).trim()
      if (maybePath && PATH_LIKE.test(maybePath)) {
        out.push({ path: maybePath, lang: maybeLang || langFromPath(maybePath), code })
        continue
      }
    }
  }

  // 2) 显式 ===FILE=== 标记（覆盖围栏，优先级更高，避免重复收集同一文件）
  const seen = new Set(out.map((f) => f.path))
  MARKER.lastIndex = 0
  while ((m = MARKER.exec(content))) {
    const path = m[1].trim()
    if (!path) continue
    const code = m[2].replace(/^\n/, '').replace(/\n+$/, '')
    seen.add(path)
    out.push({ path, lang: langFromPath(path), code })
  }

  return out
}

/** 从一组对话消息里收集文件（按 path 去重，后者覆盖前者） */
export function collectProjectFiles(messages: { role: string; content: string }[]): ProjectFile[] {
  const map = new Map<string, ProjectFile>()
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    for (const f of parseProjectFiles(msg.content)) {
      map.set(f.path, f)
    }
  }
  return Array.from(map.values())
}

/** 判断一组文件里是否有可预览的 HTML 入口（index.html / *.html） */
export function findEntryHtml(files: ProjectFile[]): ProjectFile | undefined {
  return (
    files.find((f) => /^index\.html?$/i.test(f.path)) ??
    files.find((f) => /\.html?$/i.test(f.path))
  )
}
