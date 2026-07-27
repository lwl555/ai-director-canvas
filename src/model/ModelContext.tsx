import React, { createContext, useContext, useEffect, useState } from 'react'
import { PROVIDERS, getProvider, type ModelProvider } from '../lib/modelRegistry'
import { loadApiKeys } from '../lib/userKeys'

const STORAGE_KEY = 'platform.modelId'

interface ModelCtx {
  modelId: string
  setModelId: (id: string) => void
  provider: ModelProvider
  /** 当前模型（非 Agnes）是否已在本机存了 key */
  hasKey: boolean
}

const Ctx = createContext<ModelCtx | null>(null)

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [modelId, setModelIdState] = useState<string>(() => {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return saved && PROVIDERS.find((p) => p.id === saved) ? saved : 'agnes'
  })
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})

  // 加载 key，并监听保存事件（设置页保存后实时刷新可用性指示）
  useEffect(() => {
    loadApiKeys().then(setApiKeys).catch(() => {})
    const onChanged = () => {
      loadApiKeys().then(setApiKeys).catch(() => {})
    }
    window.addEventListener('lingjing:keys-changed', onChanged)
    return () => window.removeEventListener('lingjing:keys-changed', onChanged)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, modelId)
  }, [modelId])

  const provider = getProvider(modelId)
  const setModelId = (id: string) => setModelIdState(id)
  const hasKey = !provider.needsKey || !!apiKeys[modelId]

  return (
    <Ctx.Provider value={{ modelId, setModelId, provider, hasKey }}>{children}</Ctx.Provider>
  )
}

export function useModel(): ModelCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useModel must be used within ModelProvider')
  return c
}
