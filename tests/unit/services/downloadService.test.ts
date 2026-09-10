import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadFeaturesBundle,
  downloadThemeFile,
  getDownloadThemes,
  searchDownloads,
  triggerBrowserDownload,
} from '@/services/downloadService'
import { httpGet, httpGetBlob, httpPost } from '@/services/httpClient'

vi.mock('@/services/httpClient', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpGetBlob: vi.fn(),
}))

describe('downloadService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should list themes from API', async () => {
    vi.mocked(httpGet).mockResolvedValue([
      { code: 'theme_alpha', name: 'Theme Alpha', formats: ['csv'], enabled: true },
    ])

    const themes = await getDownloadThemes()

    expect(httpGet).toHaveBeenCalledWith('downloads/themes')
    expect(themes).toHaveLength(1)
    expect(themes[0].code).toBe('theme_alpha')
  })

  it('should return empty array when themes API responds with null', async () => {
    vi.mocked(httpGet).mockResolvedValue(null as unknown as undefined)

    await expect(getDownloadThemes()).resolves.toEqual([])
  })

  it('should search downloads with filter', async () => {
    vi.mocked(httpPost).mockResolvedValue([
      {
        themeCode: 'theme_alpha',
        themeName: 'Theme Alpha',
        formats: [{ format: 'csv', status: 'available' }],
        lastUpdate: '2026-06-01',
        lastFileGenerated: '2026-06-02T10:00:00Z',
      },
    ])

    const items = await searchDownloads({ level2: 'DF', theme: null })

    expect(httpPost).toHaveBeenCalledWith('downloads/search', { level2: 'DF', theme: null })
    expect(items[0].themeCode).toBe('theme_alpha')
    expect(items[0].lastFileGenerated).toBe('2026-06-02T10:00:00Z')
  })

  it('should return empty array when search API responds with null', async () => {
    vi.mocked(httpPost).mockResolvedValue(null as unknown as undefined)

    await expect(searchDownloads({ level2: 'DF', theme: null })).resolves.toEqual([])
  })

  it('should download file blob with fallback name', async () => {
    vi.mocked(httpGetBlob).mockResolvedValue({
      blob: new Blob(['mock']),
      fileName: null,
    })

    const result = await downloadThemeFile({
      level2: 'DF',
      theme: 'theme_alpha',
      format: 'csv',
    })

    expect(httpGetBlob).toHaveBeenCalledWith(
      'downloads/file?level2=DF&theme=theme_alpha&format=csv',
    )
    expect(result.fileName).toBe('DF_theme_alpha.csv')
  })

  it('should include level3 in query and fallback name when provided', async () => {
    vi.mocked(httpGetBlob).mockResolvedValue({
      blob: new Blob(['mock']),
      fileName: null,
    })

    const result = await downloadThemeFile({
      level2: 'DF',
      level3: '5300108',
      theme: 'theme_alpha',
      format: 'csv',
    })

    expect(httpGetBlob).toHaveBeenCalledWith(
      'downloads/file?level2=DF&theme=theme_alpha&format=csv&level3=5300108',
    )
    expect(result.fileName).toBe('DF_5300108_theme_alpha.csv')
  })

  it('should prefer API filename over fallback for theme download', async () => {
    vi.mocked(httpGetBlob).mockResolvedValue({
      blob: new Blob(['mock']),
      fileName: 'custom_export.csv',
    })

    const result = await downloadThemeFile({
      level2: 'DF',
      theme: 'theme_alpha',
      format: 'csv',
    })

    expect(result.fileName).toBe('custom_export.csv')
  })

  it('should download features bundle with fallback name', async () => {
    vi.mocked(httpGetBlob).mockResolvedValue({
      blob: new Blob(['mock']),
      fileName: null,
    })

    const result = await downloadFeaturesBundle('DEMO-001')

    expect(httpGetBlob).toHaveBeenCalledWith(
      'downloads/features-bundle?aoiId=DEMO-001',
    )
    expect(result.fileName).toBe('DEMO-001_features.zip')
  })

  it('should prefer API filename over fallback for features bundle', async () => {
    vi.mocked(httpGetBlob).mockResolvedValue({
      blob: new Blob(['mock']),
      fileName: 'bundle.zip',
    })

    const result = await downloadFeaturesBundle('DEMO-001')

    expect(result.fileName).toBe('bundle.zip')
  })

  it('should trigger browser download via temporary anchor', () => {
    const blob = new Blob(['mock'])
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.fn()

    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })

    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor)
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor)

    triggerBrowserDownload(blob, 'report.csv')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(createElement).toHaveBeenCalledWith('a')
    expect(anchor.href).toBe('blob:mock-url')
    expect(anchor.download).toBe('report.csv')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalled()
    expect(removeChild).toHaveBeenCalledWith(anchor)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
