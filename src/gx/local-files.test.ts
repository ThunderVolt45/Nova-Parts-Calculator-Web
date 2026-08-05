import { describe, expect, it, vi } from 'vitest'

import {
  hasDirectoryReadPermission,
  indexDirectoryHandle,
  indexDirectoryInputFiles,
  LocalResourceIndex,
} from './local-files.ts'

function fallbackFile(contents: string, name: string, relativePath: string) {
  const file = new File([contents], name, { lastModified: 42 })
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath })
  return file
}

describe('로컬 GX 파일 인덱스', () => {
  it('디렉터리 입력의 선택 루트를 제거하고 대소문자 없이 찾는다', () => {
    const gx = fallbackFile('gx', 'LEGS1_RDRN.GX', 'common/LEGS1_RDRN.GX')
    const xfi = fallbackFile('xfi', 'legs1_rdrn.xfi', 'common/sub/legs1_rdrn.xfi')

    const index = indexDirectoryInputFiles([gx, xfi])

    expect(index.size).toBe(2)
    expect(index.find('legs1_rdrn.gx')?.relativePath).toBe('LEGS1_RDRN.GX')
    expect(index.find('sub/LEGS1_RDRN.XFI')?.name).toBe('legs1_rdrn.xfi')
  })

  it('기준 파서와 같은 순서로 텍스처 확장자를 대체한다', () => {
    const png = fallbackFile('png', 'effect.png', 'common/effect.png')
    const tga = fallbackFile('tga', 'effect.tga', 'common/effect.tga')
    const index = indexDirectoryInputFiles([png, tga])

    expect(index.findTexture('effect.dds')?.name).toBe('effect.tga')
    expect(index.findTexture('effect.dds', true)?.name).toBe('effect.png')
  })

  it('동일 파일명 충돌을 결정적인 상대 경로 순서로 보존한다', () => {
    const createEntry = (relativePath: string) => ({
      name: 'same.gx',
      relativePath,
      size: 1,
      lastModified: 1,
      source: 'directory-input' as const,
      getFile: async () => new File(['x'], 'same.gx'),
    })
    const index = new LocalResourceIndex([
      createEntry('z/same.gx'),
      createEntry('a/same.gx'),
    ])

    expect(index.find('same.gx')?.relativePath).toBe('a/same.gx')
    expect(index.findAll('same.gx')).toHaveLength(2)
  })

  it('디렉터리 핸들을 재귀 인덱싱하되 파일 내용은 요청 시 다시 연다', async () => {
    const file = new File(['gx'], 'part.gx', { lastModified: 77 })
    const getFile = vi.fn(async () => file)
    const fileHandle = { kind: 'file', name: file.name, getFile }
    const childHandle = {
      kind: 'directory',
      name: 'models',
      async *entries() {
        yield [file.name, fileHandle] as unknown as [
          string,
          FileSystemFileHandle,
        ]
      },
    }
    const rootHandle = {
      kind: 'directory',
      name: 'common',
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      async *entries() {
        yield ['models', childHandle] as [string, FileSystemDirectoryHandle]
      },
    }

    const index = await indexDirectoryHandle(
      rootHandle as unknown as FileSystemDirectoryHandle,
    )
    expect(index.find('models/part.gx')).toMatchObject({
      relativePath: 'models/part.gx',
      source: 'file-system-access',
    })
    expect(getFile).toHaveBeenCalledTimes(1)

    await index.find('part.gx')?.getFile()
    expect(getFile).toHaveBeenCalledTimes(2)
    await expect(index.hasReadPermission()).resolves.toBe(false)
  })

  it('재실행 권한은 자동 요청하지 않고 명시적으로 요청할 수 있다', async () => {
    const queryPermission = vi.fn(async () => 'prompt' as PermissionState)
    const requestPermission = vi.fn(async () => 'granted' as PermissionState)
    const handle = {
      queryPermission,
      requestPermission,
    } as unknown as FileSystemDirectoryHandle

    await expect(hasDirectoryReadPermission(handle)).resolves.toBe(false)
    expect(requestPermission).not.toHaveBeenCalled()
    await expect(hasDirectoryReadPermission(handle, true)).resolves.toBe(true)
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'read' })
  })
})
