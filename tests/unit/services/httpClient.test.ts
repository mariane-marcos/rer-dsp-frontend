import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  httpGet,
  httpGetBlob,
  httpPost,
  resetHttpClient,
  resolveApiBaseUrl,
} from '@/services/httpClient'

describe('httpClient', () => {
  beforeEach(() => {
    resetHttpClient()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_DSP_API_URL', 'http://localhost:8080/dsp-backend')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
        url: 'http://localhost:8080/dsp-backend/state/getAll',
      }),
    )
  })

  afterEach(() => {
    resetHttpClient()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('resolveApiBaseUrl', () => {
    it('should prefer VITE_DSP_API_URL when defined', async () => {
      const baseUrl = await resolveApiBaseUrl()
      expect(baseUrl).toBe('http://localhost:8080/dsp-backend')
    })

    it('should strip trailing slash from VITE_DSP_API_URL', async () => {
      resetHttpClient()
      vi.stubEnv('VITE_DSP_API_URL', 'http://localhost:8080/dsp-backend/')

      const baseUrl = await resolveApiBaseUrl()
      expect(baseUrl).toBe('http://localhost:8080/dsp-backend')
    })

    it('should return cached base URL on subsequent calls', async () => {
      const first = await resolveApiBaseUrl()
      const second = await resolveApiBaseUrl()

      expect(first).toBe(second)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('should fall back to env.json when VITE_DSP_API_URL is empty', async () => {
      resetHttpClient()
      vi.stubEnv('VITE_DSP_API_URL', '')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ urlBackend: 'http://api.from-json/dsp-backend/' }),
        }),
      )

      const baseUrl = await resolveApiBaseUrl()
      expect(baseUrl).toBe('http://api.from-json/dsp-backend')
    })

    it('should fetch env.json only once for parallel callers', async () => {
      resetHttpClient()
      vi.stubEnv('VITE_DSP_API_URL', '')

      let resolveFetch!: (value: {
        ok: boolean
        json: () => Promise<{ urlBackend: string }>
      }) => void
      const fetchMock = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const pending = Promise.all([
        resolveApiBaseUrl(),
        resolveApiBaseUrl(),
        resolveApiBaseUrl(),
      ])

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toContain('config/env.json')

      resolveFetch({
        ok: true,
        json: async () => ({ urlBackend: 'http://api.from-json/dsp-backend/' }),
      })

      const urls = await pending
      expect(urls).toEqual([
        'http://api.from-json/dsp-backend',
        'http://api.from-json/dsp-backend',
        'http://api.from-json/dsp-backend',
      ])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should throw when env.json is unavailable and env var is empty', async () => {
      resetHttpClient()
      vi.stubEnv('VITE_DSP_API_URL', '')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

      await expect(resolveApiBaseUrl()).rejects.toThrow(
        'API URL is not configured. Set VITE_DSP_API_URL or public/config/env.json (urlBackend).',
      )
    })

    it('should throw when env.json response is not ok', async () => {
      resetHttpClient()
      vi.stubEnv('VITE_DSP_API_URL', '')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
        }),
      )

      await expect(resolveApiBaseUrl()).rejects.toThrow('API URL is not configured')
    })

    it('should throw when env.json has no urlBackend', async () => {
      resetHttpClient()
      vi.stubEnv('VITE_DSP_API_URL', '')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({}),
        }),
      )

      await expect(resolveApiBaseUrl()).rejects.toThrow('API URL is not configured')
    })
  })

  describe('httpGet', () => {
    it('should call fetch with built URL and return JSON', async () => {
      const data = await httpGet<{ ok: boolean }>('state/getAll')

      expect(fetch).toHaveBeenCalledWith('http://localhost:8080/dsp-backend/state/getAll')
      expect(data).toEqual({ ok: true })
    })

    it('should throw when response is not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          url: 'http://localhost:8080/dsp-backend/state/getAll',
        }),
      )

      await expect(httpGet('state/getAll')).rejects.toThrow('HTTP 500')
    })

    it('should append query params and skip nullish values', async () => {
      await httpGet('state/getAll', {
        level2: 'DF',
        level3: undefined,
        active: true,
        count: 2,
        theme: null,
      })

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/dsp-backend/state/getAll?level2=DF&active=true&count=2',
      )
    })

    it('should normalize paths that start with slash', async () => {
      await httpGet('/state/getAll')

      expect(fetch).toHaveBeenCalledWith('http://localhost:8080/dsp-backend/state/getAll')
    })
  })

  describe('httpGetBlob', () => {
    it('should return blob and parsed filename from Content-Disposition', async () => {
      const blob = new Blob(['mock'])
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          url: 'http://localhost:8080/dsp-backend/downloads/file',
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'content-disposition'
                ? 'attachment; filename="report.csv"'
                : null,
          },
          blob: async () => blob,
        }),
      )

      const result = await httpGetBlob('downloads/file')

      expect(fetch).toHaveBeenCalledWith('http://localhost:8080/dsp-backend/downloads/file')
      expect(result.blob).toBe(blob)
      expect(result.fileName).toBe('report.csv')
    })

    it('should return null filename when Content-Disposition is missing', async () => {
      const blob = new Blob(['mock'])
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          url: 'http://localhost:8080/dsp-backend/downloads/file',
          headers: {
            get: () => null,
          },
          blob: async () => blob,
        }),
      )

      const result = await httpGetBlob('downloads/file')

      expect(result.fileName).toBeNull()
    })

    it('should throw when blob response is not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          url: 'http://localhost:8080/dsp-backend/downloads/file',
        }),
      )

      await expect(httpGetBlob('downloads/file')).rejects.toThrow('HTTP 404')
    })
  })

  describe('httpPost', () => {
    it('should post JSON body', async () => {
      const body = { level2Ids: ['DF'], level3Ids: [] }
      await httpPost('totalizer/getTotalizers', body)

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/dsp-backend/totalizer/getTotalizers',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    })
  })
})
