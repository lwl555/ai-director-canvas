import { StoreProvider } from '../store'
import CanvasApp from '../canvas/CanvasApp'

// 画布作为平台的子界面：原样保留全部导演/分镜/视频逻辑，
// 仅在此处用 StoreProvider 包裹（原本在 main.tsx 全局包裹，现收敛到本子路由）。
// 外层 .canvas-shell 强制暗色，使画布永远是专业编辑器外观，不随平台浅/深主题变化。
export default function CanvasPage() {
  return (
    <div className="canvas-shell" data-theme="dark">
      <StoreProvider>
        <CanvasApp />
      </StoreProvider>
    </div>
  )
}
