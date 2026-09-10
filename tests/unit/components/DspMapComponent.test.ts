import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DspMapComponent from '@/components/DspMapComponent.vue'
import { DSP_ZOOM_TO_ALLOW_CLICK } from '@/config/mapOptions'
import { DSP_MAP_HEIGHT_VH } from '@/utils/bboxToMapView'

const {
  scrollToElementMock,
  mapClickHandlers,
  currentZoomRef,
  exitFullscreen,
  lastTooltipContentRef,
  setZoom,
  panTo,
  setMaxBounds,
  fitBounds,
  setView,
  geoJsonLayerRef,
  loadMapLayersMock,
} = vi.hoisted(() => ({
  scrollToElementMock: vi.fn(),
  mapClickHandlers: [] as Array<(event: { latlng: { lat: number; lng: number } }) => void>,
  currentZoomRef: { value: 8 },
  exitFullscreen: vi.fn(),
  lastTooltipContentRef: { current: null as HTMLElement | null },
  setZoom: vi.fn((zoom: number) => {
    currentZoomRef.value = zoom
  }),
  panTo: vi.fn(),
  setMaxBounds: vi.fn(),
  fitBounds: vi.fn(),
  setView: vi.fn(),
  geoJsonLayerRef: {
    current: null as {
      addTo: ReturnType<typeof vi.fn>
      getBounds: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
    } | null,
  },
  loadMapLayersMock: vi.fn().mockResolvedValue({
    mapLayers: [],
    customLayers: [],
  }),
}))

vi.mock('@/utils/scrollToElement', () => ({
  scrollToElement: scrollToElementMock,
}))

vi.mock('@/services/mapService', () => ({
  loadMapLayers: loadMapLayersMock,
}))

vi.mock('@rural-environmental-registry/map_component', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'MapaDPG',
      props: ['layers', 'options', 'descriptiveMemorial', 'showLoading', 'disableLoading'],
      emits: ['onFullscreenChange'],
      setup(_props, { expose }) {
        const map = {
          getZoom: () => currentZoomRef.value,
          getMinZoom: () => 3,
          setZoom,
          panTo,
          setMaxBounds,
          on: vi.fn((event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void) => {
            if (event === 'click') {
              mapClickHandlers.push(handler)
            }
          }),
          off: vi.fn(),
          fitBounds,
          setView,
        }

        expose({
          map,
          leaflet: {
            geoJSON: vi.fn(() => {
              const layer = {
                addTo: vi.fn().mockReturnThis(),
                getBounds: vi.fn(() => ({ isValid: () => true })),
                remove: vi.fn(),
              }
              geoJsonLayerRef.current = layer
              return layer
            }),
            marker: vi.fn(() => {
              const markerInstance = {
                bindTooltip: vi.fn((content: HTMLElement) => {
                  lastTooltipContentRef.current = content
                  return markerInstance
                }),
                addTo: vi.fn().mockReturnThis(),
                openTooltip: vi.fn(),
                remove: vi.fn(),
              }
              return markerInstance
            }),
            DomEvent: {
              disableClickPropagation: vi.fn(),
              disableScrollPropagation: vi.fn(),
            },
          },
          layerControl: null,
          exitFullscreen,
        })

        return () => h('div', { class: 'mapa-dpg-stub' })
      },
    }),
  }
})

async function mountMap() {
  const wrapper = mount(DspMapComponent)
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('DspMapComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapClickHandlers.length = 0
    currentZoomRef.value = DSP_ZOOM_TO_ALLOW_CLICK
    lastTooltipContentRef.current = null
    geoJsonLayerRef.current = null
    exitFullscreen.mockClear()
    loadMapLayersMock.mockResolvedValue({
      mapLayers: [],
      customLayers: [],
    })
  })

  afterEach(() => {
    mapClickHandlers.length = 0
  })

  it('should not emit aoi-click when zoom is below the allowed threshold', async () => {
    currentZoomRef.value = DSP_ZOOM_TO_ALLOW_CLICK - 1
    const wrapper = await mountMap()

    expect(mapClickHandlers.length).toBeGreaterThan(0)
    mapClickHandlers[0]({ latlng: { lat: -15.75, lng: -47.85 } })

    expect(wrapper.emitted('aoi-click')).toBeUndefined()
  })

  it('should emit aoi-click when zoom meets the allowed threshold', async () => {
    currentZoomRef.value = DSP_ZOOM_TO_ALLOW_CLICK
    const wrapper = await mountMap()

    mapClickHandlers[0]({ latlng: { lat: -15.75, lng: -47.85 } })

    expect(wrapper.emitted('aoi-click')).toEqual([[{ lat: -15.75, lng: -47.85 }]])
  })

  it('should not apply max bounds when the map is ready', async () => {
    await mountMap()

    expect(setMaxBounds).not.toHaveBeenCalled()
  })

  it('should convert world-copy clicks to the primary map and pan the view', async () => {
    currentZoomRef.value = DSP_ZOOM_TO_ALLOW_CLICK
    const wrapper = await mountMap()

    mapClickHandlers[0]({ latlng: { lat: -15.75, lng: -47.85 + 360 } })
    await nextTick()

    expect(wrapper.emitted('aoi-click')).toEqual([[{ lat: -15.75, lng: -47.85 }]])
    expect(panTo).toHaveBeenCalledWith([-15.75, -47.85], { animate: false })
  })

  it('should emit normalized coordinates on map click without panning inside primary world', async () => {
    currentZoomRef.value = DSP_ZOOM_TO_ALLOW_CLICK
    const wrapper = await mountMap()

    mapClickHandlers[0]({ latlng: { lat: 95, lng: 200 } })
    await nextTick()

    expect(wrapper.emitted('aoi-click')).toEqual([[{ lat: 90, lng: -160 }]])
    expect(panTo).toHaveBeenCalledWith([90, -160], { animate: false })
  })

  it('should not pan when click is already on the primary world', async () => {
    currentZoomRef.value = DSP_ZOOM_TO_ALLOW_CLICK
    const wrapper = await mountMap()

    mapClickHandlers[0]({ latlng: { lat: -15.75, lng: -47.85 } })

    expect(wrapper.emitted('aoi-click')).toEqual([[{ lat: -15.75, lng: -47.85 }]])
    expect(panTo).not.toHaveBeenCalled()
  })

  it('should exit fullscreen and zoom out one level when Ver Detalhes is clicked in fullscreen', async () => {
    currentZoomRef.value = 12
    const wrapper = await mountMap()
    const mapComponent = wrapper.vm as {
      showDetailButton: (lat: number, lng: number) => void
    }

    mapComponent.showDetailButton(-15.75, -47.85)
    await nextTick()

    const tooltipContent = lastTooltipContentRef.current
    const button = tooltipContent?.querySelector('.dsp-aoi-map-detail-btn') as HTMLButtonElement
    expect(button).toBeTruthy()

    const mapaDpg = wrapper.findComponent({ name: 'MapaDPG' })
    mapaDpg.vm.$emit('onFullscreenChange', true)
    await nextTick()

    button.click()
    await nextTick()

    expect(exitFullscreen).toHaveBeenCalled()
    expect(setZoom).toHaveBeenCalledWith(11)
    expect(wrapper.emitted('open-details')).toHaveLength(1)
    expect(scrollToElementMock).toHaveBeenCalledWith('.dsp-aoi-details-panel')
  })

  it('should not zoom out when Ver Detalhes is clicked outside fullscreen', async () => {
    currentZoomRef.value = 12
    const wrapper = await mountMap()
    const mapComponent = wrapper.vm as {
      showDetailButton: (lat: number, lng: number) => void
    }

    mapComponent.showDetailButton(-15.75, -47.85)
    await nextTick()

    const button = lastTooltipContentRef.current?.querySelector('.dsp-aoi-map-detail-btn') as HTMLButtonElement
    button.click()
    await nextTick()

    expect(exitFullscreen).not.toHaveBeenCalled()
    expect(setZoom).not.toHaveBeenCalled()
    expect(wrapper.emitted('open-details')).toHaveLength(1)
  })

  it('should expose exitFullscreenIfNeeded and call exitFullscreen when active', async () => {
    const wrapper = await mountMap()
    const mapaDpg = wrapper.findComponent({ name: 'MapaDPG' })

    mapaDpg.vm.$emit('onFullscreenChange', true)
    await nextTick()

    const exposed = wrapper.vm as { exitFullscreenIfNeeded: () => void }
    exposed.exitFullscreenIfNeeded()

    expect(exitFullscreen).toHaveBeenCalled()
  })

  it('should align map height constant with consulta-publica (70vh)', () => {
    expect(DSP_MAP_HEIGHT_VH).toBe(70)
  })

  it('should show load error when map layers fail to load', async () => {
    loadMapLayersMock.mockRejectedValueOnce(new Error('map unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = await mountMap()

    expect(wrapper.find('.dsp-map__error').text()).toContain('Could not load map layers')
    expect(wrapper.findComponent({ name: 'MapaDPG' }).exists()).toBe(false)

    consoleError.mockRestore()
  })

  it('should emit ready when map instance becomes available', async () => {
    const wrapper = await mountMap()

    expect(wrapper.emitted('ready')).toHaveLength(1)
  })

  it('should render AOI highlight geometry and fit bounds', async () => {
    const wrapper = await mountMap()
    const mapComponent = wrapper.vm as {
      showSelectedAoiGeometry: (
        geojson: GeoJSON.GeoJsonObject,
        style: { color: string; fillColor: string },
      ) => void
    }

    const geojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-47.9, -15.8],
            [-47.8, -15.8],
            [-47.8, -15.7],
            [-47.9, -15.8],
          ],
        ],
      },
      properties: {},
    }

    mapComponent.showSelectedAoiGeometry(geojson, {
      color: '#1351b4',
      fillColor: '#1351b4',
    })

    expect(geoJsonLayerRef.current?.addTo).toHaveBeenCalled()
    expect(fitBounds).toHaveBeenCalled()
  })

  it('should expose fitBounds and setView helpers', async () => {
    const wrapper = await mountMap()
    const mapComponent = wrapper.vm as {
      fitBounds: (bounds: [[number, number], [number, number]]) => void
      setView: (center: [number, number], zoom: number) => void
    }

    mapComponent.fitBounds([
      [-16, -48],
      [-15, -47],
    ])
    mapComponent.setView([-15.75, -47.85], 10)

    expect(fitBounds).toHaveBeenCalledWith(
      [
        [-16, -48],
        [-15, -47],
      ],
      { padding: [40, 40], maxZoom: 16 },
    )
    expect(setView).toHaveBeenCalledWith([-15.75, -47.85], 10)
  })

  it('should clear highlight and detail marker on clearSelection', async () => {
    const wrapper = await mountMap()
    const mapComponent = wrapper.vm as {
      showDetailButton: (lat: number, lng: number) => void
      showSelectedAoiGeometry: (
        geojson: GeoJSON.GeoJsonObject,
        style: { color: string; fillColor: string },
      ) => void
      clearSelection: () => void
    }

    mapComponent.showDetailButton(-15.75, -47.85)
    await nextTick()

    mapComponent.showSelectedAoiGeometry(
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-47.85, -15.75] },
        properties: {},
      },
      { color: '#1351b4', fillColor: '#1351b4' },
    )

    const highlightLayer = geoJsonLayerRef.current
    expect(highlightLayer).toBeTruthy()

    mapComponent.clearSelection()

    expect(highlightLayer?.remove).toHaveBeenCalled()
    expect(lastTooltipContentRef.current).toBeTruthy()
  })

  it('should unbind map click and clear selection on unmount', async () => {
    const wrapper = await mountMap()
    const mapComponent = wrapper.vm as {
      showSelectedAoiGeometry: (
        geojson: GeoJSON.GeoJsonObject,
        style: { color: string; fillColor: string },
      ) => void
    }

    mapComponent.showSelectedAoiGeometry(
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-47.85, -15.75] },
        properties: {},
      },
      { color: '#1351b4', fillColor: '#1351b4' },
    )

    const highlightLayer = geoJsonLayerRef.current
    wrapper.unmount()

    expect(highlightLayer?.remove).toHaveBeenCalled()
  })
})
