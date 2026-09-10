import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBaseMaps,
  getLayers,
  loadMapLayers,
  toMapLayers,
} from '@/services/mapService'
import { httpGet } from '@/services/httpClient'

vi.mock('@/services/httpClient', () => ({
  httpGet: vi.fn(),
}))

describe('mapService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch base maps from API', async () => {
    const baseMap = [{ id: 'osm', name: 'OpenStreetMap' }]
    vi.mocked(httpGet).mockResolvedValue({ baseMap })

    const result = await getBaseMaps()

    expect(httpGet).toHaveBeenCalledWith('map/getBaseMaps')
    expect(result).toEqual({ baseMap })
  })

  it('should fetch layer groups from API', async () => {
    const groups = [{ id: 'aoi', label: 'Área de interesse', layers: [] }]
    vi.mocked(httpGet).mockResolvedValue({ groups })

    const result = await getLayers()

    expect(httpGet).toHaveBeenCalledWith('map/getLayers')
    expect(result).toEqual({ groups })
  })

  it('should merge base maps and custom layers', () => {
    const baseMap = [{ id: 'osm', name: 'OpenStreetMap' }]
    const groups = [{ id: 'aoi', label: 'Área de interesse', layers: [] }]

    expect(toMapLayers({ baseMap }, { groups })).toEqual({
      mapLayers: baseMap,
      customLayers: groups,
    })
  })

  it('should load map layers in parallel', async () => {
    const baseMap = [{ id: 'osm', name: 'OpenStreetMap' }]
    const groups = [{ id: 'aoi', label: 'Área de interesse', layers: [] }]

    vi.mocked(httpGet).mockImplementation(async (path) => {
      if (path === 'map/getBaseMaps') {
        return { baseMap }
      }
      if (path === 'map/getLayers') {
        return { groups }
      }
      throw new Error(`unexpected path: ${path}`)
    })

    const result = await loadMapLayers()

    expect(httpGet).toHaveBeenCalledWith('map/getBaseMaps')
    expect(httpGet).toHaveBeenCalledWith('map/getLayers')
    expect(result).toEqual({
      mapLayers: baseMap,
      customLayers: groups,
    })
  })
})
