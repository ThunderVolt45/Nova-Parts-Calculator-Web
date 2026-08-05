import { createContext, useContext } from 'react'

import type { LabUiSpriteKey } from './lab-ui-atlas.ts'

type SpriteUrls = ReadonlyMap<LabUiSpriteKey, string>

export interface LabUiSpriteState {
  readonly status: 'idle' | 'missing' | 'loading' | 'ready' | 'error'
  readonly urls: SpriteUrls
  readonly error: string | null
}

export const emptyLabUiSpriteState: LabUiSpriteState = {
  status: 'idle',
  urls: new Map(),
  error: null,
}

export const LabUiSpriteContext = createContext<LabUiSpriteState>(
  emptyLabUiSpriteState,
)

export function useLabUiSpriteState() {
  return useContext(LabUiSpriteContext)
}

