<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MapaDPG from '@rural-environmental-registry/map_component'
import type { MapLayers, MapOptionsConfig } from '@rural-environmental-registry/map_component/dist/types'
import { DSP_MAP_MEMORIAL, DSP_MAP_OPTIONS, DSP_ZOOM_TO_ALLOW_CLICK } from '@/config/mapOptions'
import { loadMapLayers } from '@/services/mapService'
import type { AoiHighlightStyle } from '@/services/geoserverAoiService'
import {
  isOutsidePrimaryWorldLongitude,
  toPrimaryWorldClickCoords,
} from '@/utils/normalizeMapCoordinates'
import { scrollToElement } from '@/utils/scrollToElement'

const DETAIL_PANEL_SELECTOR = '.dsp-aoi-details-panel'

const props = withDefaults(
  defineProps<{
    options?: MapOptionsConfig
    busy?: boolean
  }>(),
  {
    options: () => DSP_MAP_OPTIONS,
    busy: false,
  },
)

const emit = defineEmits<{
  'aoi-click': [payload: { lat: number; lng: number }]
  'zoom-insufficient': []
  'open-details': []
  ready: []
}>()

const readyEmitted = ref(false)

const layers = ref<MapLayers | null>(null)
const loadError = ref('')
const mapRef = ref<InstanceType<typeof MapaDPG> | null>(null)
const detailMarker = ref<{ remove: () => void } | null>(null)
const highlightLayer = ref<{ remove: () => void } | null>(null)
const clickBound = ref(false)
const isFullscreen = ref(false)

const mapInstance = computed(() => mapRef.value?.map ?? null)
const leaflet = computed(() => mapRef.value?.leaflet ?? null)
const layerControl = computed(() => mapRef.value?.layerControl ?? null)

function reconcileMapViewToPrimaryWorld(coords: { lat: number; lng: number }): void {
  const map = mapInstance.value as {
    panTo?: (latlng: [number, number], options?: { animate?: boolean }) => void
  } | null
  if (!map?.panTo) {
    return
  }
  try {
    map.panTo([coords.lat, coords.lng], { animate: false })
  } catch {
    // ignore panTo errors on invalid coordinates
  }
}

function handleMapClick(event: { latlng: { lat: number; lng: number } }): void {
  const map = mapInstance.value
  if (!map?.getZoom) {
    return
  }
  if (map.getZoom() < DSP_ZOOM_TO_ALLOW_CLICK) {
    emit('zoom-insufficient')
    return
  }

  const { lat, lng } = event.latlng
  const coords = toPrimaryWorldClickCoords(lat, lng)

  if (isOutsidePrimaryWorldLongitude(lng)) {
    reconcileMapViewToPrimaryWorld(coords)
  }

  emit('aoi-click', coords)
}

function handleFullscreenChange(active: boolean): void {
  isFullscreen.value = active
}

function exitFullscreenIfNeeded(): boolean {
  if (!isFullscreen.value) {
    return false
  }
  mapRef.value?.exitFullscreen()
  return true
}

function zoomOutOneLevel(): void {
  const map = mapInstance.value as { getZoom?: () => number; setZoom?: (zoom: number) => void; getMinZoom?: () => number } | null
  if (!map?.getZoom || !map?.setZoom) {
    return
  }
  try {
    const minZoom = map.getMinZoom?.() ?? 0
    map.setZoom(Math.max(map.getZoom() - 1, minZoom))
  } catch {
    // ignore setZoom errors
  }
}

function handleOpenDetailsClick(): void {
  const wasFullscreen = exitFullscreenIfNeeded()
  if (wasFullscreen) {
    zoomOutOneLevel()
  }
  emit('open-details')
  void nextTick(() => scrollToDetailPanel())
}

function bindMapClick(): void {
  const map = mapInstance.value
  if (!map || clickBound.value) {
    return
  }
  map.on('click', handleMapClick)
  clickBound.value = true
}

function unbindMapClick(): void {
  const map = mapInstance.value
  if (map && clickBound.value) {
    map.off('click', handleMapClick)
  }
  clickBound.value = false
}

function removeDetailButton(): void {
  if (detailMarker.value) {
    detailMarker.value.remove()
    detailMarker.value = null
  }
}

function removeHighlight(): void {
  if (highlightLayer.value) {
    highlightLayer.value.remove()
    highlightLayer.value = null
  }
}

function clearSelection(): void {
  removeDetailButton()
  removeHighlight()
}

function scrollToDetailPanel(): void {
  scrollToElement(DETAIL_PANEL_SELECTOR)
}

function fitBounds(bounds: [[number, number], [number, number]]): void {
  const map = mapInstance.value
  if (!map?.fitBounds) {
    return
  }
  try {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
  } catch {
    // ignore fitBounds errors on invalid bounds
  }
}

function setView(center: [number, number], zoom: number): void {
  const map = mapInstance.value
  if (!map?.setView) {
    return
  }
  try {
    map.setView(center, zoom)
  } catch {
    // ignore setView errors on invalid coordinates
  }
}

function showSelectedAoiGeometry(
  geojson: GeoJSON.GeoJsonObject,
  style: AoiHighlightStyle,
): void {
  const map = mapInstance.value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = leaflet.value as any
  if (!map || !L?.geoJSON) {
    return
  }

  removeHighlight()

  const layer = L.geoJSON(geojson, {
    interactive: false,
    style: {
      color: style.color,
      fillColor: style.fillColor,
      weight: style.weight ?? 3,
      fillOpacity: style.fillOpacity ?? 0.45,
      opacity: style.opacity ?? 1,
    },
  })

  layer.addTo(map)
  highlightLayer.value = layer

  try {
    const layerBounds = layer.getBounds?.()
    if (layerBounds?.isValid?.()) {
      map.fitBounds(layerBounds, { padding: [40, 40], maxZoom: 16 })
    }
  } catch {
    // ignore fitBounds errors on empty geometry
  }
}

function buildDetailButtonContent(L: {
  DomEvent?: {
    disableClickPropagation: (el: HTMLElement) => void
    disableScrollPropagation?: (el: HTMLElement) => void
  }
}): HTMLElement {
  const container = document.createElement('div')
  container.className = 'dsp-aoi-tooltip__content'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'dsp-aoi-map-detail-btn'
  button.textContent = 'Ver Detalhes'
  container.appendChild(button)

  L.DomEvent?.disableClickPropagation(container)
  L.DomEvent?.disableScrollPropagation?.(container)

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handleOpenDetailsClick()
  })

  return container
}

function showDetailButton(lat: number, lng: number): void {
  const map = mapInstance.value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = leaflet.value as any

  if (!map || !L?.marker) {
    return
  }

  removeDetailButton()

  const marker = L.marker([lat, lng], {
    opacity: 0,
    interactive: false,
  })

  marker.bindTooltip(buildDetailButtonContent(L), {
    permanent: true,
    direction: 'top',
    className: 'dsp-aoi-tooltip',
    opacity: 1,
    offset: [0, -10],
    interactive: true,
  })

  detailMarker.value = marker.addTo(map)
  marker.openTooltip()
}

onMounted(async () => {
  try {
    layers.value = await loadMapLayers()
  } catch (error) {
    console.error(error)
    loadError.value =
      'Could not load map layers. Check the API (map/getBaseMaps, map/getLayers).'
  }
})

watch(
  mapInstance,
  async (map) => {
    if (!map) {
      return
    }
    await nextTick()
    bindMapClick()
    if (!readyEmitted.value) {
      readyEmitted.value = true
      emit('ready')
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  unbindMapClick()
  clearSelection()
})

defineExpose({
  mapRef,
  map: mapInstance,
  leaflet,
  layerControl,
  layers,
  showDetailButton,
  removeDetailButton,
  showSelectedAoiGeometry,
  fitBounds,
  setView,
  clearSelection,
  exitFullscreenIfNeeded,
})
</script>

<template>
  <div class="dsp-map" :class="{ 'dsp-map--busy': props.busy }">
    <p v-if="loadError" class="dsp-map__error">{{ loadError }}</p>
    <MapaDPG
      v-else-if="layers"
      ref="mapRef"
      :layers="layers"
      :options="props.options"
      :descriptive-memorial="DSP_MAP_MEMORIAL"
      :show-loading="false"
      :disable-loading="true"
      @on-fullscreen-change="handleFullscreenChange"
    />
  </div>
</template>

<style scoped>
.dsp-map {
  --dsp-map-height: 70vh;
  width: 100%;
  height: var(--dsp-map-height);
  margin: 0 0 24px;
  border: 1px solid #d9d9d9;
  overflow: hidden;
  position: relative;
}

.dsp-map__error {
  margin: 24px;
  font-size: 14px;
  color: #b9382e;
}

.dsp-map :deep(.map-container) {
  width: 100%;
  height: 100%;
}

.dsp-map :deep(.leaflet-control),
.dsp-map :deep(.leaflet-control a),
.dsp-map :deep(.leaflet-control button),
.dsp-map :deep(.leaflet-control input),
.dsp-map :deep(.leaflet-control label) {
  cursor: pointer;
}

.dsp-map--busy :deep(.leaflet-container),
.dsp-map--busy :deep(.leaflet-grab) {
  cursor: wait;
}

.dsp-map :deep(.dsp-aoi-tooltip) {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  pointer-events: auto;
}

.dsp-map :deep(.dsp-aoi-tooltip::before) {
  display: none;
}

.dsp-map :deep(.dsp-aoi-tooltip__content) {
  text-align: center;
}

.dsp-map :deep(.dsp-aoi-map-detail-btn) {
  background-color: #1351b4;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.dsp-map :deep(.dsp-aoi-map-detail-btn:hover) {
  background-color: #0d3c8c;
}
</style>
