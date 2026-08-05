import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import type { LocalResourceIndex } from './local-files.ts'
import {
  extractLabUiSprites,
  LAB_UI_FILE_NAME,
  type LabUiSpriteKey,
} from './lab-ui-atlas.ts'
import {
  emptyLabUiSpriteState,
  LabUiSpriteContext,
  type LabUiSpriteState,
  useLabUiSpriteState,
} from './lab-ui-sprite-context.ts'

export function LabUiSpriteProvider({
  index,
  children,
}: {
  index: LocalResourceIndex | null
  children: ReactNode
}) {
  const [state, setState] = useState<LabUiSpriteState>(emptyLabUiSpriteState)

  useEffect(() => {
    const atlas = index?.find(LAB_UI_FILE_NAME)
    let cancelled = false
    let createdUrls: string[] = []

    if (!index) {
      setState(emptyLabUiSpriteState)
      return
    }
    if (!atlas) {
      setState({ status: 'missing', urls: new Map(), error: null })
      return
    }
    setState({ status: 'loading', urls: new Map(), error: null })

    const load = async () => {
      try {
        const sprites = await extractLabUiSprites(await atlas.getFile())
        const nextUrls = new Map<LabUiSpriteKey, string>()
        for (const [key, sprite] of sprites) {
          const url = URL.createObjectURL(sprite)
          createdUrls.push(url)
          nextUrls.set(key, url)
        }

        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url))
          createdUrls = []
        } else {
          setState({ status: 'ready', urls: nextUrls, error: null })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            urls: new Map(),
            error: error instanceof Error ? error.message : 'lab_ui.png 처리 실패',
          })
        }
      }
    }
    void load()

    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [index])

  return (
    <LabUiSpriteContext.Provider value={state}>
      {children}
    </LabUiSpriteContext.Provider>
  )
}

export function LabUiSprite({
  spriteKey,
  className,
  label,
  fallback,
}: {
  spriteKey: LabUiSpriteKey | null
  className: string
  label: string
  fallback?: ReactNode
}) {
  const { urls } = useLabUiSpriteState()
  const url = spriteKey ? urls.get(spriteKey) : undefined

  return (
    <span className={`${className}${url ? ' has-game-sprite' : ''}`}>
      {url ? <img src={url} alt="" aria-hidden="true" /> : fallback}
      <span className="sr-only">{label}</span>
    </span>
  )
}
