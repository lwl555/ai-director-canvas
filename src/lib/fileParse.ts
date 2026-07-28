// 办公模式「文件舱」解析：把用户选中的任意办公文件归一化成可送入模型的文本 / 图片。
// 支持：图片（压缩）、txt/md/csv/json 等纯文本（编码探测）、docx（mammoth）、xlsx/xls（SheetJS）。
// 设计目标：对齐豆包办公模式「一个对话框打穿所有办公文件」——一次多文件，跨文档交叉分析。
//
// 注意：mammoth / xlsx 用动态 import，仅在用户真正上传对应格式时才加载，避免拖慢首屏。

import { decodeFileText } from './textDecode'
import { fileToScaledDataUrl } from './imageUtil'

export type ParsedKind = 'text' | 'image' | 'docx' | 'xlsx' | 'unsupported'

export interface ParsedFile {
  name: string
  kind: ParsedKind
  text?: string // 文档 / 表格解析出的纯文本（仅 text/docx/xlsx 有）
  dataUrl?: string // 图片（仅 image 有）
  rawBase64?: string // 原始文件字节（base64），用于「真虚拟机办公」上传到沙箱
  error?: string // 不支持或解析失败时的说明
}

// ArrayBuffer → base64（用于把原始文件字节传给后端沙箱）
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

// 纯文本类扩展名（其余走编码探测也会兜底）
const TEXT_EXT = new Set([
  'txt', 'md', 'text', 'csv', 'json', 'log', 'xml', 'yaml', 'yml',
  'html', 'htm', 'js', 'ts', 'jsx', 'tsx', 'css', 'py', 'toml', 'ini', 'sql', 'md'
])

// 单文件文本上限（字符）。跨文档分析时多文件累积，过大会撑爆模型上下文，这里保守截断。
const MAX_DOC_CHARS = 24000
// 文件舱同时挂载的文件数上限
export const MAX_OFFICE_FILES = 6

function extOf(name: string): string {
  const i = name.toLowerCase().lastIndexOf('.')
  return i >= 0 ? name.toLowerCase().slice(i + 1) : ''
}

/** 解析单个文件为 ParsedFile。任何异常都不会抛出，统一返回 kind:'unsupported'。 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name
  const ext = extOf(name)
  try {
    // —— 图片：压缩成 data URL（复用聊天图片压缩逻辑）——
    if (file.type.startsWith('image/')) {
      const dataUrl = await fileToScaledDataUrl(file)
      const rawBase64 = dataUrl.split(',')[1] || ''
      return { name, kind: 'image', dataUrl, rawBase64 }
    }

    // —— Word 文档：mammoth 提取纯文本 ——
    if (ext === 'docx') {
      const mammoth = await import('mammoth')
      const buf = await file.arrayBuffer()
      const res = await mammoth.extractRawText({ arrayBuffer: buf })
      const text = (res.value || '').slice(0, MAX_DOC_CHARS)
      if (!text.trim()) return { name, kind: 'unsupported', error: '文档内容为空或无法提取' }
      return { name, kind: 'docx', text, rawBase64: bufToB64(buf) }
    }

    // —— Excel 表格：SheetJS 逐表转 CSV 文本 ——
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.map((sn) => {
        const ws = wb.Sheets[sn]
        return `【表格页《${sn}》】\n` + (XLSX.utils.sheet_to_csv(ws) || '(空)')
      }).join('\n\n')
      const text = sheets.slice(0, MAX_DOC_CHARS)
      return { name, kind: 'xlsx', text, rawBase64: bufToB64(buf) }
    }

    // —— 纯文本类：编码探测解码 ——
    if (TEXT_EXT.has(ext) || file.type.startsWith('text/') || file.type === 'application/json') {
      const text = (await decodeFileText(file)).slice(0, MAX_DOC_CHARS)
      const buf = await file.arrayBuffer()
      return { name, kind: 'text', text, rawBase64: bufToB64(buf) }
    }

    return { name, kind: 'unsupported', error: '暂不支持此格式（PDF 等请先转成 txt/Word）' }
  } catch (e: any) {
    return { name, kind: 'unsupported', error: e?.message || '解析失败' }
  }
}
