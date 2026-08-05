const TEXTURE_SUFFIXES = {
  alpha: ['.png', '.tga', '.bmp', '.jpg', '.jpeg'],
  opaque: ['.tga', '.bmp', '.png', '.jpg', '.jpeg'],
} as const

export type LocalFileSource = 'file-system-access' | 'directory-input'

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: typeof showDirectoryPicker
}

export interface LocalResourceFile {
  readonly name: string
  readonly relativePath: string
  readonly size: number
  readonly lastModified: number
  readonly source: LocalFileSource
  getFile(): Promise<File>
}

function normalizeLookup(value: string) {
  return value
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .normalize('NFC')
    .toLowerCase()
}

function basename(value: string) {
  return value.replaceAll('\\', '/').split('/').at(-1) ?? value
}

function extensionStart(value: string) {
  const name = basename(value)
  const position = name.lastIndexOf('.')
  return position > 0 ? position : name.length
}

function stem(value: string) {
  const name = basename(value)
  return name.slice(0, extensionStart(name))
}

function safeRelativePath(path: string) {
  const segments = path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')

  if (segments.some((segment) => segment === '..')) {
    throw new Error(`승인된 폴더 밖을 가리키는 경로입니다: ${path}`)
  }

  return segments.join('/')
}

export class LocalResourceIndex {
  readonly #entries: readonly LocalResourceFile[]
  readonly #byPath = new Map<string, LocalResourceFile>()
  readonly #byName = new Map<string, LocalResourceFile[]>()
  readonly #requiresPermissionRecheck: boolean
  readonly #permissionCheck?: (request: boolean) => Promise<boolean>

  constructor(
    entries: Iterable<LocalResourceFile>,
    permissionCheck?: (request: boolean) => Promise<boolean>,
  ) {
    this.#entries = [...entries].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    )
    this.#requiresPermissionRecheck = this.#entries.some(
      (entry) => entry.source === 'file-system-access',
    )
    this.#permissionCheck = permissionCheck

    for (const entry of this.#entries) {
      const pathKey = normalizeLookup(entry.relativePath)
      const nameKey = normalizeLookup(entry.name)
      this.#byPath.set(pathKey, entry)
      const sameName = this.#byName.get(nameKey) ?? []
      sameName.push(entry)
      this.#byName.set(nameKey, sameName)
    }
  }

  get size() {
    return this.#entries.length
  }

  entries() {
    return this.#entries
  }

  async hasReadPermission(request = false) {
    if (!this.#requiresPermissionRecheck) return true
    return this.#permissionCheck ? this.#permissionCheck(request) : false
  }

  find(reference: string) {
    const normalized = normalizeLookup(reference)
    if (normalized.includes('/')) {
      const exactPath = this.#byPath.get(normalized)
      if (exactPath) return exactPath
    }

    return this.#byName.get(normalizeLookup(basename(reference)))?.[0]
  }

  findAll(reference: string) {
    return this.#byName.get(normalizeLookup(basename(reference))) ?? []
  }

  findTexture(reference: string, impliesAlpha = false) {
    const direct = this.find(basename(reference))
    if (direct) return direct

    const wantedStem = normalizeLookup(stem(reference))
    const suffixes = impliesAlpha
      ? TEXTURE_SUFFIXES.alpha
      : TEXTURE_SUFFIXES.opaque

    for (const suffix of suffixes) {
      const fallback = this.find(`${stem(reference)}${suffix}`)
      if (fallback) return fallback
    }

    return this.#entries.find(
      (entry) => normalizeLookup(stem(entry.name)) === wantedStem,
    )
  }
}

function relativePathFromFile(file: File) {
  const selectedPath = file.webkitRelativePath || file.name
  const segments = safeRelativePath(selectedPath).split('/')
  return segments.length > 1 ? segments.slice(1).join('/') : segments[0]
}

export function indexDirectoryInputFiles(files: Iterable<File>) {
  return new LocalResourceIndex(
    [...files].map((file): LocalResourceFile => ({
      name: file.name,
      relativePath: relativePathFromFile(file),
      size: file.size,
      lastModified: file.lastModified,
      source: 'directory-input',
      getFile: async () => file,
    })),
  )
}

async function collectDirectoryEntries(
  directory: FileSystemDirectoryHandle,
  parentPath: string,
): Promise<LocalResourceFile[]> {
  const handles: Array<[string, FileSystemHandleUnion]> = []
  for await (const pair of directory.entries()) handles.push(pair)
  handles.sort(([left], [right]) => left.localeCompare(right))

  const entries: LocalResourceFile[] = []
  for (const [name, handle] of handles) {
    const relativePath = safeRelativePath(
      parentPath.length > 0 ? `${parentPath}/${name}` : name,
    )
    if (handle.kind === 'directory') {
      entries.push(...(await collectDirectoryEntries(handle, relativePath)))
      continue
    }

    const file = await handle.getFile()
    entries.push({
      name: file.name,
      relativePath,
      size: file.size,
      lastModified: file.lastModified,
      source: 'file-system-access',
      getFile: () => handle.getFile(),
    })
  }

  return entries
}

export async function indexDirectoryHandle(
  directory: FileSystemDirectoryHandle,
) {
  return new LocalResourceIndex(
    await collectDirectoryEntries(directory, ''),
    (request) => hasDirectoryReadPermission(directory, request),
  )
}

export function supportsDirectoryPicker(
  browserWindow: DirectoryPickerWindow = window,
): browserWindow is DirectoryPickerWindow & {
  showDirectoryPicker: typeof showDirectoryPicker
} {
  return typeof browserWindow.showDirectoryPicker === 'function'
}

export async function requestCommonDirectory(
  browserWindow: DirectoryPickerWindow = window,
) {
  if (!supportsDirectoryPicker(browserWindow)) {
    throw new Error('이 브라우저는 디렉터리 핸들 선택을 지원하지 않습니다.')
  }

  return browserWindow.showDirectoryPicker({
    id: 'nova-1492-common',
    mode: 'read',
  })
}

export async function hasDirectoryReadPermission(
  directory: FileSystemDirectoryHandle,
  request = false,
) {
  const descriptor = { mode: 'read' } as const
  const current = await directory.queryPermission(descriptor)
  if (current === 'granted') return true
  if (!request) return false
  return (await directory.requestPermission(descriptor)) === 'granted'
}
