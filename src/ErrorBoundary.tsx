import React from 'react'

interface State {
  error: Error | null
}

// 全局错误边界：任何渲染期异常都显示可读的错误信息，而不是黑/白屏。
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal">
          <div className="fatal-box">
            <h2>⚠️ 界面出错了</h2>
            <p>已拦截一个渲染错误，页面没有崩。请把下面的错误信息发给我，我直接定位修复：</p>
            <pre>{this.state.error.message}</pre>
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
