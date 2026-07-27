import type { CapacitorConfig } from '@capacitor/cli'

// 原生 APP 配置：
// - webDir 指向 vite 构建产物 dist/（构建时需带 CAPACITOR=1 让 base 变 '/'）
// - server.androidScheme 用 https，避免混合内容/清漆问题
const config: CapacitorConfig = {
  appId: 'com.lingjing.ai',
  appName: '灵境 AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
