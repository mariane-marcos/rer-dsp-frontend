import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import SearchFilterComponent from '@/components/SearchFilterComponent.vue'
import DetailSearchComponent from '@/components/DetailSearchComponent.vue'
import {
  getDetailsByCoordinates,
  getDetailsByIdentifier,
  getTotalizers,
} from '@/services/totalizerService'
import { fetchAoiGeometryById } from '@/services/geoserverAoiService'
import { getTerritoryBoundaryBox } from '@/services/territoryService'
import { getInstallationConfig } from '@/services/configService'
import { DSP_MAP_OPTIONS } from '@/config/mapOptions'
import { bboxToMapView } from '@/utils/bboxToMapView'
import { FALLBACK_INSTALLATION_CONFIG } from '@/config/installationConfigFallback'

const { downloadFeaturesBundle, triggerBrowserDownload } = vi.hoisted(() => ({
  downloadFeaturesBundle: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}))

vi.mock('@/services/downloadService', () => ({
  downloadFeaturesBundle,
  triggerBrowserDownload,
}))

vi.mock('@/services/totalizerService', () => ({
  getTotalizers: vi.fn(),
  getDetailsByIdentifier: vi.fn(),
  getDetailsByCoordinates: vi.fn(),
}))

const { prepareAoiHighlightGeometryMock } = vi.hoisted(() => ({
  prepareAoiHighlightGeometryMock: vi.fn((geojson: GeoJSON.GeoJsonObject) => geojson),
}))

vi.mock('@/utils/prepareAoiHighlightGeometry', () => ({
  prepareAoiHighlightGeometry: prepareAoiHighlightGeometryMock,
}))

vi.mock('@/services/geoserverAoiService', async () => {
  const actual = await vi.importActual<typeof import('@/services/geoserverAoiService')>(
    '@/services/geoserverAoiService',
  )
  return {
    ...actual,
    fetchAoiGeometryById: vi.fn(),
  }
})

vi.mock('@/services/configService', async () => {
  const { FALLBACK_INSTALLATION_CONFIG } = await import('@/config/installationConfigFallback')
  return {
    getInstallationConfig: vi.fn().mockResolvedValue(FALLBACK_INSTALLATION_CONFIG),
    peekInstallationConfig: vi.fn().mockReturnValue(FALLBACK_INSTALLATION_CONFIG),
  }
})

vi.mock('@/services/territoryService', () => ({
  getTerritoryOptions: vi.fn().mockImplementation(async (level, parentId) => {
    if (level === 'level2' && !parentId) {
      return [{ id: 'DF', name: 'DF - Distrito Federal' }]
    }
    if (level === 'level3' && parentId === 'DF') {
      return [{ id: '5300108', name: 'Brasília' }]
    }
    return []
  }),
  getTerritoryBoundaryBox: vi.fn(),
}))

vi.mock('@fortawesome/vue-fontawesome', () => ({
  FontAwesomeIcon: {
    name: 'FontAwesomeIcon',
    template: '<i />',
  },
}))

const {
  showSelectedAoiGeometry,
  showDetailButton,
  clearSelection,
  fitBounds,
  setView,
  exitFullscreenIfNeeded,
} = vi.hoisted(() => ({
  showSelectedAoiGeometry: vi.fn(),
  showDetailButton: vi.fn(),
  clearSelection: vi.fn(),
  fitBounds: vi.fn(),
  setView: vi.fn(),
  exitFullscreenIfNeeded: vi.fn(),
}))

vi.mock('@/components/DspMapComponent.vue', () => ({
  default: {
    name: 'DspMapComponent',
    props: ['options', 'busy'],
    template: '<div class="dsp-map-stub" />',
    data() {
      return {
        layers: {
          mapLayers: [],
          customLayers: [
            {
              name: 'Declared areas of interest',
              key: 'ird',
              toggle: { active: 'On', inactive: 'Off' },
              layers: [
                {
                  baseUrl: 'http://localhost:22668/geoserver/dsp/wms',
                  layers: 'dsp:area-of-interest',
                  format: 'image/png',
                  transparent: true,
                  name: 'Area of interest',
                  activeDefault: true,
                  active: true,
                  key: 'ird_aoi',
                  toggle: { active: 'On', inactive: 'Off' },
                  style: { color: '#cccc00', fillColor: '#ffff00' },
                },
              ],
            },
          ],
        },
      }
    },
    methods: {
      showDetailButton,
      removeDetailButton: vi.fn(),
      showSelectedAoiGeometry,
      fitBounds,
      setView,
      clearSelection,
      exitFullscreenIfNeeded,
    },
  },
}))

const sampleHighlightGeoJson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-47.9, -15.8],
            [-47.8, -15.8],
            [-47.8, -15.7],
            [-47.9, -15.7],
            [-47.9, -15.8],
          ],
        ],
      },
      properties: {},
    },
  ],
}

const initialBbox = {
  minX: -74.0,
  minY: -34.0,
  maxX: -34.0,
  maxY: 5.0,
}

const territoryBbox = {
  minX: -48.2,
  minY: -16.0,
  maxX: -47.3,
  maxY: -15.5,
}

async function mountHome() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/geoservices', component: { template: '<div />' } },
      { path: '/about', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()

  const wrapper = mount(HomeView, {
    global: {
      plugins: [router],
    },
  })
  await flushPromises()
  return wrapper
}

describe('HomeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTotalizers).mockResolvedValue([
      {
        name: 'Registered properties',
        code: 'AREA_OF_INTEREST',
        value: 100,
        unitOfMeasurement: 'un.',
      },
    ])
    vi.mocked(getDetailsByIdentifier).mockResolvedValue(null)
    vi.mocked(getDetailsByCoordinates).mockResolvedValue(null)
    vi.mocked(fetchAoiGeometryById).mockResolvedValue(sampleHighlightGeoJson)
    prepareAoiHighlightGeometryMock.mockImplementation((geojson) => geojson)
    vi.mocked(getTerritoryBoundaryBox).mockImplementation(async (options = {}) => {
      if (
        !(options.level1Ids?.length || options.level2Ids?.length || options.level3Ids?.length)
      ) {
        return initialBbox
      }
      return territoryBbox
    })
  })

  it('should render detail panel when identifier search succeeds', async () => {
    vi.mocked(getDetailsByIdentifier).mockResolvedValue({
      id: 'DF123456789012',
      registrationDate: '2020-01-10',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.793889',
      longitude: '-47.882778',
      area: 120.5,
      alterationDate: '2024-06-15',
    })

    const wrapper = await mountHome()

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: [],
      level3: [],
      identifier: 'DF123456789012',
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Search details')
    expect(wrapper.text()).toContain('DF123456789012')
    expect(wrapper.text()).toContain('Download features')
    expect(wrapper.text()).not.toContain('Registered properties')
    expect(wrapper.find('.data-cards-section').exists()).toBe(false)
    expect(fetchAoiGeometryById).toHaveBeenCalledWith(
      'DF123456789012',
      'http://localhost:22668/geoserver/dsp/wfs',
    )
    expect(prepareAoiHighlightGeometryMock).toHaveBeenCalledWith(sampleHighlightGeoJson)
    expect(showSelectedAoiGeometry).toHaveBeenCalledWith(
      sampleHighlightGeoJson,
      expect.any(Object),
    )
    expect(searchFilter.vm.form.level2).toEqual(['DF'])
    expect(searchFilter.vm.form.level3).toEqual(['5300108'])
  })

  it('should download features bundle when detail panel emits download-features', async () => {
    vi.mocked(getDetailsByIdentifier).mockResolvedValue({
      id: 'DF123456789012',
      registrationDate: '2020-01-10',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.793889',
      longitude: '-47.882778',
      area: 120.5,
      alterationDate: '2024-06-15',
    })
    vi.mocked(downloadFeaturesBundle).mockResolvedValue({
      blob: new Blob(['zip']),
      fileName: 'df123456789012_features.zip',
    })

    const wrapper = await mountHome()
    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: [],
      level3: [],
      identifier: 'DF123456789012',
    })
    await flushPromises()

    const detail = wrapper.findComponent(DetailSearchComponent)
    await detail.vm.$emit('download-features', 'DF123456789012')
    await flushPromises()

    expect(downloadFeaturesBundle).toHaveBeenCalledWith('DF123456789012')
    expect(triggerBrowserDownload).toHaveBeenCalled()
  })

  it('should highlight AOI on map click without opening details until open-details', async () => {
    vi.mocked(getDetailsByCoordinates).mockResolvedValue({
      id: 'DF-123',
      registrationDate: '2020-01-10',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.75',
      longitude: '-47.85',
      area: 120.5,
      alterationDate: '2024-06-15',
      otherIds: ['DF-456'],
    })
    vi.mocked(getDetailsByIdentifier).mockResolvedValue({
      id: 'DF-456',
      registrationDate: '2021-02-11',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.75',
      longitude: '-47.85',
      area: 80,
      alterationDate: '2024-06-15',
      otherIds: [],
    })

    const wrapper = await mountHome()

    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()

    expect(getDetailsByCoordinates).toHaveBeenCalledWith({
      lat: -15.75,
      lng: -47.85,
    })
    expect(fetchAoiGeometryById).toHaveBeenCalledWith(
      'DF-123',
      'http://localhost:22668/geoserver/dsp/wfs',
    )
    expect(prepareAoiHighlightGeometryMock).toHaveBeenCalledWith(sampleHighlightGeoJson)
    expect(showSelectedAoiGeometry).toHaveBeenCalled()
    expect(showDetailButton).toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Search details')
    expect(wrapper.text()).not.toContain('Outros próximos')
    expect(wrapper.find('.data-cards-section').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Registered properties')
    expect(searchFilter.vm.form.identifier).toBe('DF-123')
    expect(searchFilter.vm.form.level2).toEqual(['DF'])
    expect(searchFilter.vm.form.level3).toEqual(['5300108'])

    await map.vm.$emit('open-details')
    await flushPromises()

    expect(wrapper.text()).toContain('DF-123')
    expect(wrapper.text()).toContain('Outros próximos')
    expect(wrapper.text()).toContain('DF-456')

    const otherBtn = wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'DF-456')
    expect(otherBtn).toBeTruthy()
    await otherBtn!.trigger('click')
    await flushPromises()

    expect(getDetailsByIdentifier).toHaveBeenCalledWith('DF-456')
    expect(fetchAoiGeometryById).toHaveBeenCalledWith(
      'DF-456',
      'http://localhost:22668/geoserver/dsp/wfs',
    )
    expect(showSelectedAoiGeometry).toHaveBeenCalled()
    expect(wrapper.text()).toContain('DF-456')
    expect(searchFilter.vm.form.identifier).toBe('DF-456')
  })

  it('should show clear button and reset state after opening map details', async () => {
    vi.mocked(getDetailsByCoordinates).mockResolvedValue({
      id: 'DF-123',
      registrationDate: '2020-01-10',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.75',
      longitude: '-47.85',
      area: 120.5,
      alterationDate: '2024-06-15',
    })

    const wrapper = await mountHome()
    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    const map = wrapper.findComponent({ name: 'DspMapComponent' })

    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()
    await map.vm.$emit('open-details')
    await flushPromises()

    const clearButton = searchFilter
      .findAll('button')
      .find((button) => button.text().includes('Clear'))
    expect(clearButton).toBeTruthy()

    await clearButton!.trigger('click')
    await flushPromises()

    expect(clearSelection).toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Search details')
    expect(wrapper.text()).toContain('Registered properties')
    expect(searchFilter.vm.form.identifier).toBe('')
    expect(searchFilter.vm.form.level2).toEqual([])
  })

  it('should show no-aoi feedback below the map without error styling above it', async () => {
    vi.mocked(getDetailsByCoordinates).mockResolvedValue(null)

    const wrapper = await mountHome()
    const map = wrapper.findComponent({ name: 'DspMapComponent' })

    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()

    expect(wrapper.text()).toContain('No area of interest found')
    expect(wrapper.text()).toContain('Try selecting another location on the map.')
    expect(wrapper.find('.status-msg--error').exists()).toBe(false)
    expect(wrapper.find('.map-feedback-panel').exists()).toBe(true)
    expect(clearSelection).toHaveBeenCalled()
    expect(wrapper.findComponent(DetailSearchComponent).exists()).toBe(false)
    expect(wrapper.text()).toContain('Registered properties')
  })

  it('should keep KPIs visible when no-aoi click happens without prior map selection', async () => {
    vi.mocked(getDetailsByCoordinates).mockResolvedValue(null)

    const wrapper = await mountHome()
    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    const map = wrapper.findComponent({ name: 'DspMapComponent' })

    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: ['DF'],
      level3: [],
      identifier: '',
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Registered properties')

    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()

    expect(wrapper.text()).toContain('No area of interest found')
    expect(wrapper.text()).toContain('Registered properties')
  })

  it('should hide KPIs and clear identifier when no-aoi click follows map selection', async () => {
    vi.mocked(getDetailsByCoordinates)
      .mockResolvedValueOnce({
        id: 'DF-123',
        registrationDate: '2020-01-10',
        territory: {
          level2: { id: 'DF', name: 'Distrito Federal' },
          level3: { id: '5300108', name: 'Brasília' },
        },
        latitude: '-15.75',
        longitude: '-47.85',
        area: 120.5,
        alterationDate: '2024-06-15',
      })
      .mockResolvedValueOnce(null)

    const wrapper = await mountHome()
    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    const searchFilter = wrapper.findComponent(SearchFilterComponent)

    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()

    expect(wrapper.find('.data-cards-section').exists()).toBe(false)
    expect(searchFilter.vm.form.identifier).toBe('DF-123')

    await map.vm.$emit('aoi-click', { lat: -16.0, lng: -48.0 })
    await flushPromises()

    expect(wrapper.text()).toContain('No area of interest found')
    expect(wrapper.find('.data-cards-section').exists()).toBe(false)
    expect(searchFilter.vm.form.identifier).toBe('')
    expect(searchFilter.vm.form.level2).toEqual(['DF'])
    expect(searchFilter.vm.form.level3).toEqual(['5300108'])
  })

  it('should hide KPIs and clear identifier when zoom feedback follows map selection', async () => {
    vi.mocked(getDetailsByCoordinates).mockResolvedValue({
      id: 'DF-123',
      registrationDate: '2020-01-10',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.75',
      longitude: '-47.85',
      area: 120.5,
      alterationDate: '2024-06-15',
    })

    const wrapper = await mountHome()
    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    const searchFilter = wrapper.findComponent(SearchFilterComponent)

    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()

    expect(wrapper.find('.data-cards-section').exists()).toBe(false)
    expect(searchFilter.vm.form.identifier).toBe('DF-123')

    await map.vm.$emit('zoom-insufficient')
    await flushPromises()

    expect(wrapper.text()).toContain('Zoom in to select an area of interest')
    expect(wrapper.find('.data-cards-section').exists()).toBe(false)
    expect(searchFilter.vm.form.identifier).toBe('')
  })

  it('should show zoom feedback below the map without showing clear for map-only interaction', async () => {
    const wrapper = await mountHome()
    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    const searchFilter = wrapper.findComponent(SearchFilterComponent)

    await map.vm.$emit('zoom-insufficient')
    await flushPromises()

    expect(wrapper.text()).toContain('Zoom in to select an area of interest')
    expect(wrapper.find('.map-feedback-panel').exists()).toBe(true)
    expect(searchFilter.text()).not.toContain('Clear')
    expect(clearSelection).toHaveBeenCalled()
  })

  it('should clear map feedback when clear is clicked while search filters are active', async () => {
    const wrapper = await mountHome()
    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    const searchFilter = wrapper.findComponent(SearchFilterComponent)

    searchFilter.vm.form.level2 = ['DF']
    await flushPromises()

    await map.vm.$emit('zoom-insufficient')
    await flushPromises()

    expect(wrapper.text()).toContain('Zoom in to select an area of interest')

    const clearButton = searchFilter
      .findAll('button')
      .find((button) => button.text().includes('Clear'))
    expect(clearButton).toBeTruthy()

    await clearButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('Zoom in to select an area of interest')
    expect(wrapper.find('.map-feedback-panel').exists()).toBe(false)
  })

  it('should remove previous detail panel when map click finds no aoi', async () => {
    vi.mocked(getDetailsByCoordinates).mockResolvedValue({
      id: 'DF-123',
      registrationDate: '2020-01-10',
      territory: {
        level2: { id: 'DF', name: 'Distrito Federal' },
        level3: { id: '5300108', name: 'Brasília' },
      },
      latitude: '-15.75',
      longitude: '-47.85',
      area: 120.5,
      alterationDate: '2024-06-15',
    })

    const wrapper = await mountHome()
    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    const searchFilter = wrapper.findComponent(SearchFilterComponent)

    await map.vm.$emit('aoi-click', { lat: -15.75, lng: -47.85 })
    await flushPromises()
    await map.vm.$emit('open-details')
    await flushPromises()

    expect(wrapper.text()).toContain('DF-123')

    vi.mocked(getDetailsByCoordinates).mockResolvedValue(null)
    await map.vm.$emit('aoi-click', { lat: -16.0, lng: -48.0 })
    await flushPromises()

    expect(wrapper.text()).not.toContain('DF-123')
    expect(wrapper.findComponent(DetailSearchComponent).exists()).toBe(false)
    expect(wrapper.text()).toContain('No area of interest found')
    expect(searchFilter.vm.form.identifier).toBe('')
  })

  it('should render banner and load initial KPIs', async () => {
    const wrapper = await mountHome()

    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).toContain('Data Sharing Platform')

    const logo = wrapper.find('.br-map img')
    expect(logo.exists()).toBe(true)
    expect(logo.attributes('src')).toBe(`${import.meta.env.BASE_URL}images/Logo-RER.png`)
    expect(logo.attributes('alt')).toBe('Logo RER')

    expect(getTotalizers).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Registered properties')
  })

  it('should mount map with center and zoom derived from L1 boundary-box', async () => {
    const wrapper = await mountHome()
    const expectedView = bboxToMapView(initialBbox)

    expect(getTerritoryBoundaryBox).toHaveBeenCalledWith({})
    expect(fitBounds).not.toHaveBeenCalled()

    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    expect(map.exists()).toBe(true)
    expect(map.props('options').map.config.center).toEqual(expectedView.center)
    expect(map.props('options').map.config.zoom).toBe(expectedView.zoom)
  })

  it('should mount map with planet view when initial boundary-box fails', async () => {
    vi.mocked(getTerritoryBoundaryBox).mockRejectedValueOnce(new Error('bbox unavailable'))

    const wrapper = await mountHome()

    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    expect(map.exists()).toBe(true)
    expect(map.props('options').map.config.center).toEqual([0, 0])
    expect(map.props('options').map.config.zoom).toBe(0)
    expect(fitBounds).not.toHaveBeenCalled()
  })

  it('should mount map with manual mode without calling boundary-box', async () => {
    vi.mocked(getInstallationConfig).mockResolvedValueOnce({
      ...FALLBACK_INSTALLATION_CONFIG,
      map: {
        initialView: {
          mode: 'manual',
          latitude: 39.5,
          longitude: -8.0,
          zoom: 7,
        },
      },
    })

    const wrapper = await mountHome()

    expect(getTerritoryBoundaryBox).not.toHaveBeenCalled()

    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    expect(map.props('options').map.config.center).toEqual([39.5, -8.0])
    expect(map.props('options').map.config.zoom).toBe(7)
    expect(map.props('options').tools.center.target).toBe('initial')
  })

  it('should mount map with planet mode without calling boundary-box', async () => {
    vi.mocked(getInstallationConfig).mockResolvedValueOnce({
      ...FALLBACK_INSTALLATION_CONFIG,
      map: {
        initialView: {
          mode: 'planet',
        },
      },
    })

    const wrapper = await mountHome()

    expect(getTerritoryBoundaryBox).not.toHaveBeenCalled()

    const map = wrapper.findComponent({ name: 'DspMapComponent' })
    expect(map.props('options').map.config.center).toEqual([0, 0])
    expect(map.props('options').map.config.zoom).toBe(0)
    expect(map.props('options').tools.center.target).toBe('initial')
  })

  it('should reset to configured initial view on clear when manual map view is set', async () => {
    vi.mocked(getInstallationConfig).mockResolvedValueOnce({
      ...FALLBACK_INSTALLATION_CONFIG,
      map: {
        initialView: {
          mode: 'manual',
          latitude: 39.5,
          longitude: -8.0,
          zoom: 7,
        },
      },
    })

    const wrapper = await mountHome()
    vi.clearAllMocks()
    vi.mocked(getTotalizers).mockResolvedValue([
      {
        name: 'Registered properties',
        code: 'AREA_OF_INTEREST',
        value: 100,
        unitOfMeasurement: 'un.',
      },
    ])

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('clear')
    await flushPromises()

    expect(clearSelection).toHaveBeenCalled()
    expect(getTerritoryBoundaryBox).not.toHaveBeenCalled()
    expect(setView).toHaveBeenCalledWith([39.5, -8.0], 7)
    expect(fitBounds).not.toHaveBeenCalled()
  })

  it('should reset to planet view on clear when territorial bbox is unavailable', async () => {
    const wrapper = await mountHome()
    vi.clearAllMocks()
    vi.mocked(getTotalizers).mockResolvedValue([
      {
        name: 'Registered properties',
        code: 'AREA_OF_INTEREST',
        value: 100,
        unitOfMeasurement: 'un.',
      },
    ])
    vi.mocked(getTerritoryBoundaryBox).mockRejectedValueOnce(new Error('bbox unavailable'))

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('clear')
    await flushPromises()

    expect(setView).toHaveBeenCalledWith([0, 0], 0)
    expect(fitBounds).not.toHaveBeenCalled()
  })

  it('should reset selection KPIs and zoom to default boundary-box on clear', async () => {
    const wrapper = await mountHome()
    vi.clearAllMocks()
    vi.mocked(getTotalizers).mockResolvedValue([
      {
        name: 'Registered properties',
        code: 'AREA_OF_INTEREST',
        value: 100,
        unitOfMeasurement: 'un.',
      },
    ])
    vi.mocked(getTerritoryBoundaryBox).mockResolvedValue(initialBbox)

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('clear')
    await flushPromises()

    expect(clearSelection).toHaveBeenCalled()
    expect(getTotalizers).toHaveBeenCalledWith({
      level2Ids: [],
      level3Ids: [],
    })
    expect(getTerritoryBoundaryBox).toHaveBeenCalledWith({})
    expect(fitBounds).toHaveBeenCalledWith([
      [initialBbox.minY, initialBbox.minX],
      [initialBbox.maxY, initialBbox.maxX],
    ])
  })

  it('should zoom to territory bbox on L2/L3 search without identifier and without detail button', async () => {
    const wrapper = await mountHome()

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: ['DF'],
      level3: ['5300108'],
      identifier: '',
    })
    await flushPromises()

    expect(getTotalizers).toHaveBeenCalledWith({
      level2Ids: ['DF'],
      level3Ids: ['5300108'],
    })
    expect(getTerritoryBoundaryBox).toHaveBeenCalledWith({
      level2Ids: ['DF'],
      level3Ids: ['5300108'],
    })
    expect(fitBounds).toHaveBeenCalledWith([
      [territoryBbox.minY, territoryBbox.minX],
      [territoryBbox.maxY, territoryBbox.maxX],
    ])
    expect(showSelectedAoiGeometry).not.toHaveBeenCalled()
    expect(showDetailButton).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Search details')
  })

  it('should zoom to unified bbox when multiple level3 are selected', async () => {
    const wrapper = await mountHome()

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: ['DF'],
      level3: ['5300108', '5300109'],
      identifier: '',
    })
    await flushPromises()

    expect(getTotalizers).toHaveBeenCalledWith({
      level2Ids: ['DF'],
      level3Ids: ['5300108', '5300109'],
    })
    expect(getTerritoryBoundaryBox).toHaveBeenCalledWith({
      level2Ids: ['DF'],
      level3Ids: ['5300108', '5300109'],
    })
    expect(fitBounds).toHaveBeenCalled()
    expect(showSelectedAoiGeometry).not.toHaveBeenCalled()
    expect(showDetailButton).not.toHaveBeenCalled()
  })

  it('should zoom to unified L2 bbox when multiple level2 and no level3', async () => {
    const wrapper = await mountHome()

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: ['DF', 'GO'],
      level3: [],
      identifier: '',
    })
    await flushPromises()

    expect(getTotalizers).toHaveBeenCalledWith({
      level2Ids: ['DF', 'GO'],
      level3Ids: [],
    })
    expect(getTerritoryBoundaryBox).toHaveBeenCalledWith({
      level2Ids: ['DF', 'GO'],
      level3Ids: [],
    })
    expect(fitBounds).toHaveBeenCalled()
    expect(showSelectedAoiGeometry).not.toHaveBeenCalled()
    expect(showDetailButton).not.toHaveBeenCalled()
  })

  it('should zoom to L2 bbox when level3 is empty', async () => {
    const wrapper = await mountHome()

    const searchFilter = wrapper.findComponent(SearchFilterComponent)
    await searchFilter.vm.$emit('search', {
      level1: '',
      level2: ['DF'],
      level3: [],
      identifier: '',
    })
    await flushPromises()

    expect(getTerritoryBoundaryBox).toHaveBeenCalledWith({
      level2Ids: ['DF'],
      level3Ids: [],
    })
    expect(fitBounds).toHaveBeenCalled()
    expect(showSelectedAoiGeometry).not.toHaveBeenCalled()
    expect(showDetailButton).not.toHaveBeenCalled()
  })
})
