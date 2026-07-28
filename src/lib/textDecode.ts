// 通用文本文件解码：优先 UTF-8，遇到替换符 / 解码失败再回退 GBK / GB18030。
// 解决 Windows 记事本默认 ANSI(GBK) 保存的中文 .txt，在 FileReader.readAsText 默认
// UTF-8 解码下出现「乱码」的问题（典型表现：浣犲ソ / ���� 这类方块）。
//
// 用法：const text = await decodeFileText(file)

/** 把 File 解码为字符串；自动探测 UTF-8 / GBK / GB18030。 */
export async function decodeFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)

  // 1) BOM 优先：EF BB BF → UTF-8；FF FE → UTF-16LE
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }

  // 2) 先按 UTF-8 试解（fatal:false 不会抛错，遇到非法序列会塞替换符 U+FFFD）
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

  // 含替换符 ⇒ 大概率不是 UTF-8（GBK 中文双字节常被误判）→ 回退中文编码
  if (utf8.includes('�')) {
    const decoded = tryDecodeChinese(bytes)
    if (decoded !== null) return decoded
  }
  return utf8
}

// 依次尝试 GB18030 / GBK；返回 null 表示都不支持（极旧环境）。
function tryDecodeChinese(bytes: Uint8Array): string | null {
  for (const label of ['gb18030', 'gbk']) {
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      /* 标签不被支持，试下一个 */
    }
  }
  return null
}
