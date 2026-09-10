<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SearchFilterComponent, {
  type SearchFilterPayload,
} from '@/components/SearchFilterComponent.vue'
import DetailSearchComponent from '@/components/DetailSearchComponent.vue'
import LoadingDotsComponent from '@/components/LoadingDotsComponent.vue'
import KpiCardComponent from '@/components/KpiCardComponent.vue'
import {
  buildHierarchyFieldsByKey,
  buildSearchFormConfig,
  hierarchyFieldsByKey,
  homeSearchConfig,
  type HierarchyFieldConfig,
  type HierarchyLevelKey,
  type SearchFormConfig,
} from '@/config/searchHierarchy'
import { prepareAoiHighlightGeometry } from '@/utils/prepareAoiHighlightGeometry'
import {
  mockTotalizerValues,
  resolveHomeKpis,
  type KpiItem,
} from '@/config/homeKpis'
import { FALLBACK_INSTALLATION_CONFIG } from '@/config/installationConfigFallback'
import { getInstallationConfig } from '@/services/configService'
import {
  getDetailsByCoordinates,
  getDetailsByIdentifier,
  getTotalizers,
} from '@/services/totalizerService'
import type {
  LayerData,
  MapOptionsConfig,
} from '@rural-environmental-registry/map_component/dist/types'
import {
  fetchAoiGeometryById,
  findAoiLayer,
  wmsBaseUrlToWfs,
} from '@/services/geoserverAoiService'
import { getTerritoryBoundaryBox } from '@/services/territoryService'
import { DSP_MAP_OPTIONS } from '@/config/mapOptions'
import { bboxToMapView } from '@/utils/bboxToMapView'
import {
  PLANET_MAP_VIEW,
  resolveInitialMapStrategy,
  type ResolvedInitialMapStrategy,
  type ResolvedInitialMapView,
} from '@/utils/resolveInitialMapView'
import { darkenHex } from '@/utils/darkenColor'
import type { HomeKpisConfig, InstallationConfig } from '@/types/installationConfig'
import type { DetailByIdentifierDTO } from '@/types/totalizer'
import type { TerritoryBoundaryBox } from '@/types/territory'
import DspMapComponent from '@/components/DspMapComponent.vue'
import MoreContents from '@/components/MoreContents.vue'
import { getMoreContentsCards } from '@/config/moreContentsUi'
import { getAboutConfig } from '@/services/aboutService'
import {
  downloadFeaturesBundle,
  triggerBrowserDownload,
} from '@/services/downloadService'

const pageCards = ref(getMoreContentsCards('home', false))
onMounted(async () => {
  const aboutConfig = await getAboutConfig()
  pageCards.value = getMoreContentsCards('home', aboutConfig.enabled)
})
const logoRerSrc = `${import.meta.env.BASE_URL}images/Logo-RER.png`
const AOI_HIGHLIGHT_DARKEN_BORDER = 0.75
const AOI_HIGHLIGHT_DARKEN_FILL = 0.6

const searching = ref(false)
const searchError = ref('')
const featuresDownloading = ref(false)
const featuresDownloadError = ref('')
const detailByIdentifier = ref<DetailByIdentifierDTO | null>(null)
const pendingDetail = ref<DetailByIdentifierDTO | null>(null)
const candidateIds = ref<string[]>([])
const kpiConfig = ref<HomeKpisConfig>(FALLBACK_INSTALLATION_CONFIG.kpis)
const kpis = ref<KpiItem[]>(resolveHomeKpis(mockTotalizerValues, kpiConfig.value))
const searchConfig = ref<SearchFormConfig>(homeSearchConfig)
const hierarchyFields = ref<Record<HierarchyLevelKey, HierarchyFieldConfig>>(hierarchyFieldsByKey)
const mapRef = ref<InstanceType<typeof DspMapComponent> | null>(null)
const searchFilterRef = ref<InstanceType<typeof SearchFilterComponent> | null>(null)
const mapOptions = ref<MapOptionsConfig | null>(null)
const installationConfig = ref<InstallationConfig>(FALLBACK_INSTALLATION_CONFIG)
const initialMapStrategy = ref<ResolvedInitialMapStrategy>(
  resolveInitialMapStrategy(FALLBACK_INSTALLATION_CONFIG),
)

function buildMapOptionsFromView(
  view: ResolvedInitialMapView,
  options: { fixedInitialView?: boolean } = {},
): MapOptionsConfig {
  const fixedInitialView = options.fixedInitialView ?? false
  return {
    ...DSP_MAP_OPTIONS,
    map: {
      ...DSP_MAP_OPTIONS.map,
      config: {
        ...DSP_MAP_OPTIONS.map.config,
        center: view.center,
        zoom: view.zoom,
      },
    },
    tools: fixedInitialView
      ? {
          ...DSP_MAP_OPTIONS.tools,
          center: {
            ...DSP_MAP_OPTIONS.tools?.center,
            target: 'initial',
          },
        }
      : DSP_MAP_OPTIONS.tools,
  }
}

function buildMapOptionsFromBbox(bbox: TerritoryBoundaryBox): MapOptionsConfig {
  const { center, zoom } = bboxToMapView(bbox)
  return {
    ...DSP_MAP_OPTIONS,
    map: {
      ...DSP_MAP_OPTIONS.map,
      config: {
        ...DSP_MAP_OPTIONS.map.config,
        center,
        zoom,
      },
    },
  }
}

function buildDetailWithCandidates(
  detail: DetailByIdentifierDTO,
  candidates?: string[],
): DetailByIdentifierDTO {
  const id = detail.id?.trim()
  const nextCandidates =
    candidates ??
    (id
      ? [id, ...(detail.otherIds ?? []).filter((otherId) => otherId && otherId !== id)]
      : [...(detail.otherIds ?? [])])

  candidateIds.value = nextCandidates
  return {
    ...detail,
    otherIds: id
      ? nextCandidates.filter((candidateId) => candidateId !== id)
      : nextCandidates,
  }
}

function applyDetail(detail: DetailByIdentifierDTO, candidates?: string[]): void {
  const next = buildDetailWithCandidates(detail, candidates)
  pendingDetail.value = next
  detailByIdentifier.value = next
  kpis.value = []
}

async function syncSearchFilterWithDetail(detail: DetailByIdentifierDTO): Promise<void> {
  const id = detail.id?.trim()
  if (id) {
    searchFilterRef.value?.applyIdentifierSelection(id)
  }

  await searchFilterRef.value?.applyTerritorySelection({
    level2Id: detail.territory?.level2?.id,
    level3Id: detail.territory?.level3?.id,
    level2Label: detail.territory?.level2?.name,
    level3Label: detail.territory?.level3?.name,
  })
}

function clearDetailAndMapSelection(): void {
  detailByIdentifier.value = null
  pendingDetail.value = null
  candidateIds.value = []
  mapRef.value?.clearSelection()
}

function resolveHighlightStyleFromLayer(
  layer: LayerData | null,
  fallbackColor = '#cccc00',
  fallbackFill = '#ffff00',
): { color: string; fillColor: string } {
  const color = layer?.style?.color ?? fallbackColor
  const fillColor = layer?.style?.fillColor ?? fallbackFill
  return {
    color: darkenHex(color, AOI_HIGHLIGHT_DARKEN_BORDER),
    fillColor: darkenHex(
      fillColor === 'transparent' ? color : fillColor,
      AOI_HIGHLIGHT_DARKEN_FILL,
    ),
  }
}

function resolveHighlightStyle(): { color: string; fillColor: string } {
  return resolveHighlightStyleFromLayer(findAoiLayer(mapRef.value?.layers ?? null))
}

function resolveButtonCoords(
  detail: DetailByIdentifierDTO,
  fallback?: { lat: number; lng: number },
): { lat: number; lng: number } | null {
  const lat = Number(detail.latitude)
  const lng = Number(detail.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng }
  }
  return fallback ?? null
}

async function highlightAoiOnMap(
  detail: DetailByIdentifierDTO,
  fallbackCoords?: { lat: number; lng: number },
): Promise<void> {
  const id = detail.id?.trim()
  if (!id) {
    return
  }

  const aoiLayer = findAoiLayer(mapRef.value?.layers ?? null)
  if (!aoiLayer?.baseUrl) {
    searchError.value = 'AOI map layer is not configured.'
    return
  }

  const geojson = await fetchAoiGeometryById(id, wmsBaseUrlToWfs(aoiLayer.baseUrl))
  if (!geojson) {
    searchError.value = 'Could not load AOI geometry from GeoServer.'
    return
  }

  mapRef.value?.showSelectedAoiGeometry(
    prepareAoiHighlightGeometry(geojson),
    resolveHighlightStyle(),
  )

  const coords = resolveButtonCoords(detail, fallbackCoords)
  if (coords) {
    mapRef.value?.showDetailButton(coords.lat, coords.lng)
  }
}

function applyTerritoryBounds(bbox: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): void {
  mapRef.value?.fitBounds([
    [bbox.minY, bbox.minX],
    [bbox.maxY, bbox.maxX],
  ])
}

async function zoomToTerritory(
  level2Ids: string[],
  level3Ids: string[] = [],
): Promise<void> {
  const bbox = await getTerritoryBoundaryBox({
    level2Ids,
    level3Ids,
  })
  applyTerritoryBounds(bbox)
}

async function zoomToInitialTerritory(): Promise<void> {
  const strategy = initialMapStrategy.value
  if (strategy.kind === 'manual' || strategy.kind === 'planet') {
    mapRef.value?.setView(strategy.view.center, strategy.view.zoom)
    return
  }

  try {
    const bbox = await getTerritoryBoundaryBox({})
    applyTerritoryBounds(bbox)
  } catch (error) {
    console.warn(
      'Initial territory boundary box unavailable — using planet map view.',
      error,
    )
    mapRef.value?.setView(PLANET_MAP_VIEW.center, PLANET_MAP_VIEW.zoom)
  }
}

async function loadTotalizers(level2Ids: string[], level3Ids: string[]): Promise<void> {
  const totalizers = await getTotalizers({
    level2Ids,
    level3Ids,
  })
  kpis.value = resolveHomeKpis(totalizers, kpiConfig.value)
}

async function loadInitialKpis(): Promise<void> {
  try {
    await loadTotalizers([], [])
  } catch (error) {
    console.warn('Initial KPIs from API unavailable — keeping mock values.', error)
    kpis.value = resolveHomeKpis(mockTotalizerValues, kpiConfig.value)
  }
}

async function loadInitialMapOptions(): Promise<void> {
  const strategy = initialMapStrategy.value
  if (strategy.kind === 'manual') {
    mapOptions.value = buildMapOptionsFromView(strategy.view, { fixedInitialView: true })
    return
  }

  if (strategy.kind === 'planet') {
    mapOptions.value = buildMapOptionsFromView(strategy.view, { fixedInitialView: true })
    return
  }

  try {
    const bbox = await getTerritoryBoundaryBox({})
    mapOptions.value = buildMapOptionsFromBbox(bbox)
  } catch (error) {
    console.warn(
      'Initial territory boundary box unavailable — using planet map view.',
      error,
    )
    mapOptions.value = buildMapOptionsFromView(PLANET_MAP_VIEW, { fixedInitialView: true })
  }
}

const onSearch = async (payload: SearchFilterPayload) => {
  searching.value = true
  searchError.value = ''
  clearDetailAndMapSelection()

  try {
    const identifier = payload.identifier.trim()

    if (identifier) {
      const detail = await getDetailsByIdentifier(identifier)
      if (!detail) {
        searchError.value = 'Identifier not found.'
        return
      }
      applyDetail(detail, [detail.id ?? identifier])
      await syncSearchFilterWithDetail(detail)
      try {
        await highlightAoiOnMap(detail)
      } catch (error) {
        console.error(error)
        searchError.value = 'Could not load AOI geometry from GeoServer.'
      }
      return
    }

    const level2Ids = (payload.level2 ?? []).map(String).filter((id) => id.trim())
    if (!level2Ids.length) {
      searchError.value = 'Select at least level 2 to search.'
      return
    }

    const level3Ids = (payload.level3 ?? []).map(String).filter((id) => id.trim())
    await loadTotalizers(level2Ids, level3Ids)
    try {
      await zoomToTerritory(level2Ids, level3Ids)
    } catch (error) {
      console.error(error)
      searchError.value = 'Could not load territory boundary box.'
    }
  } catch (error) {
    console.error(error)
    searchError.value = 'Search failed. Check the API (config/env.json).'
  } finally {
    searching.value = false
  }
}

const onClear = () => {
  searchError.value = ''
  featuresDownloadError.value = ''
  clearDetailAndMapSelection()
  void loadInitialKpis()
  void zoomToInitialTerritory()
}

const onAoiClick = async (coords: { lat: number; lng: number }) => {
  searching.value = true
  searchError.value = ''
  detailByIdentifier.value = null

  try {
    const detail = await getDetailsByCoordinates(coords)
    if (!detail) {
      searchError.value = 'No area of interest found at this location.'
      mapRef.value?.clearSelection()
      pendingDetail.value = null
      candidateIds.value = []
      return
    }

    pendingDetail.value = buildDetailWithCandidates(detail)
    await highlightAoiOnMap(pendingDetail.value, coords)
  } catch (error) {
    console.error(error)
    searchError.value = 'Map click search failed. Check the API (config/env.json).'
  } finally {
    searching.value = false
  }
}

const onOpenDetails = async () => {
  if (!pendingDetail.value) {
    return
  }

  detailByIdentifier.value = pendingDetail.value
  await syncSearchFilterWithDetail(pendingDetail.value)
}

const onSelectAoi = async (id: string) => {
  if (!id || id === pendingDetail.value?.id) {
    return
  }

  searching.value = true
  searchError.value = ''

  try {
    const detail = await getDetailsByIdentifier(id)
    if (!detail) {
      searchError.value = 'Identifier not found.'
      return
    }

    const next = buildDetailWithCandidates(
      detail,
      candidateIds.value.length ? candidateIds.value : undefined,
    )
    pendingDetail.value = next
    if (detailByIdentifier.value) {
      detailByIdentifier.value = next
      await syncSearchFilterWithDetail(next)
    }
    await highlightAoiOnMap(next)
  } catch (error) {
    console.error(error)
    searchError.value = 'Search failed. Check the API (config/env.json).'
  } finally {
    searching.value = false
  }
}

const onDownloadFeatures = async (aoiId: string) => {
  if (!aoiId?.trim()) {
    return
  }

  featuresDownloading.value = true
  featuresDownloadError.value = ''

  try {
    const { blob, fileName } = await downloadFeaturesBundle(aoiId.trim())
    triggerBrowserDownload(blob, fileName)
  } catch (error) {
    console.error(error)
    if (error instanceof Error && error.message.includes('HTTP 404')) {
      featuresDownloadError.value = 'No data available for download.'
    } else {
      featuresDownloadError.value = 'Could not download features.'
    }
  } finally {
    featuresDownloading.value = false
  }
}

async function loadInstallationConfig(): Promise<void> {
  const installation = await getInstallationConfig()
  installationConfig.value = installation
  initialMapStrategy.value = resolveInitialMapStrategy(installation)
  searchConfig.value = buildSearchFormConfig(installation, 'home')
  hierarchyFields.value = buildHierarchyFieldsByKey(installation)
  kpiConfig.value = installation.kpis
}

onMounted(async () => {
  await loadInstallationConfig()
  await Promise.all([loadInitialKpis(), loadInitialMapOptions()])
})
</script>

<template>
  <div class="main-container">
    <div class="banner-container">
      <div class="br-map">
        <img
          :src="logoRerSrc"
          alt="Logo RER"
          width="1390"
          height="540"
        />
      </div>
      <div class="banner-content">
        <h1>
          <strong class="project-name"> Data Sharing Platform</strong>
        </h1>
        <h2>Public geospatial consultation portal</h2>
      </div>
    </div>

    <div class="main-page-container">
      <div class="content-general">
        <SearchFilterComponent
          ref="searchFilterRef"
          :config="searchConfig"
          :hierarchy-fields="hierarchyFields"
          :session-active="Boolean(detailByIdentifier || pendingDetail)"
          @search="onSearch"
          @clear="onClear"
        />

        <p v-if="searching" class="status-msg"><LoadingDotsComponent /></p>
        <p v-else-if="searchError" class="status-msg status-msg--error">{{ searchError }}</p>

        <section v-else-if="kpis.length && !detailByIdentifier" class="data-cards-section">
          <div class="data-cards">
            <div v-for="kpi in kpis" :key="kpi.id" class="data-card-container">
              <KpiCardComponent
                class="data-card"
                :title="kpi.title"
                :value="kpi.value"
                :unit-of-measurement="kpi.unitOfMeasurement"
                :optional-label="kpi.optionalLabel"
                :optional-value="kpi.optionalValue"
                :accent-color="kpi.accentColor"
              />
            </div>
          </div>
        </section>

        <DspMapComponent
          v-if="mapOptions"
          ref="mapRef"
          :options="mapOptions"
          :busy="searching"
          @aoi-click="onAoiClick"
          @open-details="onOpenDetails"
        />
        <div v-else class="dsp-map-placeholder" aria-hidden="true" />

        <p v-if="featuresDownloadError" class="features-download-error">
          {{ featuresDownloadError }}
        </p>

        <DetailSearchComponent
          v-if="detailByIdentifier"
          :detail="detailByIdentifier"
          :downloading-features="featuresDownloading"
          @select-aoi="onSelectAoi"
          @download-features="onDownloadFeatures"
        />
      </div>
    </div>

    <MoreContents :cards="pageCards" />
  </div>
</template>

<style scoped>
.main-container {
  width: 100%;
  background: #fff;
}

.banner-container {
  padding-top: 10px;
  display: flex;
  flex-direction: row;
  padding-bottom: 24px;
}

.br-map {
  background: #f9f2d2;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px 24px 56px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.br-map img {
  width: min(340px, 32vw);
  max-height: 180px;
  height: auto;
  object-fit: contain;
  display: block;
}

.banner-content {
  height: 220px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: right center;
  background-color: #f9f2d2;
  color: #42916e;
  display: flex;
  flex-grow: 2;
  flex-direction: column;
  justify-content: center;
  padding: 70px 70px 70px 24px;
  gap: 10px;
  box-sizing: border-box;
}

.banner-content h1 {
  margin: 0;
  font-size: 40px;
  font-weight: 200;
}

.project-name {
  font-size: clamp(32px, 5vw, 60px);
  font-weight: 600;
}

.banner-content h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 100;
}

.main-page-container {
  width: 100%;
  display: flex;
  justify-content: center;
}

.content-general {
  width: 92%;
}

.features-download-error {
  margin: 0 0 12px;
  color: #b9382e;
  font-size: 14px;
}

.dsp-map-placeholder {
  width: 100%;
  height: 70vh;
  margin: 0 0 24px;
  border: 1px solid #d9d9d9;
  background: #f5f5f5;
}

.status-msg {
  margin: 0 0 16px;
  font-size: 14px;
  color: #707070;
}

.status-msg--error {
  color: #b9382e;
}

.data-cards-section {
  margin-bottom: 32px;
  width: 100%;
}

.data-cards {
  --kpi-gap: 16px;
  --kpi-max-slots: 5;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: center;
  gap: var(--kpi-gap);
  width: 100%;
  margin-bottom: 26px;
}

.data-card-container {
  flex: 0 0
    calc(
      (100% - (var(--kpi-max-slots) - 1) * var(--kpi-gap)) / var(--kpi-max-slots)
    );
  width: calc(
    (100% - (var(--kpi-max-slots) - 1) * var(--kpi-gap)) / var(--kpi-max-slots)
  );
  min-width: 0;
  padding: 8px 0;
  box-sizing: border-box;
}

.data-card {
  width: 100%;
}

@media screen and (max-width: 950px) {
  .banner-container {
    flex-direction: column;
  }

  .br-map {
    display: none;
  }

  .banner-content {
    width: 100%;
    background-size: cover;
  }

  .data-cards {
    flex-direction: column;
    flex-wrap: wrap;
  }

  .data-card-container {
    flex: 1 1 auto;
    width: 100%;
  }
}
</style>
