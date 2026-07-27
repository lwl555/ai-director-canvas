// 最小 ZIP 写入器（store 模式，无压缩）。
// 跨 Node / 浏览器：直接产出 Uint8Array，可供 new Blob(...) 下载。
// 仅支持 STORE（压缩方法 0），对 WebView 工程这类小文本完全够用，且实现简单零依赖。
//
// 结构：每个文件一个本地文件头 + 数据；最后中央目录 + EOCD。

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function strBytes(s) {
  return new TextEncoder().encode(s)
}

// little-endian 写入辅助
function u16(v) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff])
}
function u32(v) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
}

function concat(parts) {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/**
 * @param {{path:string, data:Uint8Array}[]} entries
 * @returns {Uint8Array}
 */
export function zipStore(entries) {
  const enc = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0

  for (const e of entries) {
    const nameBytes = enc.encode(e.path)
    const data = e.data
    const crc = crc32(data)
    const size = data.length

    // 本地文件头
    const local = concat([
      u32(0x04034b50), // 签名
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method = store
      u16(0), // mod time
      u16(0), // mod date
      u32(crc), // crc32
      u32(size), // compressed size
      u32(size), // uncompressed size
      u16(nameBytes.length),
      u16(0) // extra len
    ])
    chunks.push(local, nameBytes, data)

    // 中央目录记录
    const cd = concat([
      u32(0x02014b50), // 签名
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk number
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset) // local header offset
    ])
    central.push(cd, nameBytes)

    offset += local.length + nameBytes.length + data.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const c of central) {
    chunks.push(c)
    centralSize += c.length
  }

  // EOCD
  const eocd = concat([
    u32(0x06054b50),
    u16(0), // disk
    u16(0), // disk with cd
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralStart),
    u16(0) // comment len
  ])
  chunks.push(eocd)

  // 合并
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

// 供测试：把 string 转 Uint8Array
export function toBytes(s) {
  return strBytes(s)
}
