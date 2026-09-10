<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import type { DetailByIdentifierDTO } from '@/types/totalizer'
import {
  buildDetailByIdentifierConfig,
  getDetailFieldsByGroup,
  getPropertyFieldRows,
  readDetailFieldValue,
  type DetailFieldConfig,
} from '@/config/detailByIdentifier'
import { peekInstallationConfig } from '@/services/configService'
import { formatDate } from '@/utils/dateFormat'
import { formatPropertyMeasures } from '@/utils/format'
import LoadingDotsComponent from '@/components/LoadingDotsComponent.vue'

const props = withDefaults(
  defineProps<{
    detail: DetailByIdentifierDTO
    downloadingFeatures?: boolean
  }>(),
  {
    downloadingFeatures: false,
  },
)

const emit = defineEmits<{
  'select-aoi': [id: string]
  'download-features': [id: string]
}>()

const installation = peekInstallationConfig()
const config = buildDetailByIdentifierConfig(installation)
const datePattern = installation.formats.date
const headerFields = computed(() => getDetailFieldsByGroup('header', config))
const propertyRows = computed(() => getPropertyFieldRows(config))
const otherIds = computed(() =>
  (props.detail.otherIds ?? []).filter((id) => id && id !== props.detail.id),
)
const expanded = ref(true)

function readFieldValue(field: DetailFieldConfig): string {
  const raw = readDetailFieldValue(props.detail, field)
  if (raw === undefined || raw === null || raw === '') {
    return config.emptyValue
  }

  if (field.formatAsDate) {
    return formatDate(String(raw), datePattern)
  }

  if (field.formatAsMeasure) {
    const formatted = formatPropertyMeasures(raw)
    return field.unitSuffix ? `${formatted} ${field.unitSuffix}` : formatted
  }

  return String(raw)
}

function onSelectOther(id: string): void {
  emit('select-aoi', id)
}

function onDownloadFeatures(): void {
  const id = props.detail.id?.trim()
  if (!id || !config.featuresDownload.enabled || props.downloadingFeatures) {
    return
  }
  emit('download-features', id)
}
</script>

<template>
  <section
    class="details-panel dsp-aoi-details-panel"
    :aria-label="config.sectionTitle"
  >
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="expanded"
      :aria-controls="`detail-panel-content-${detail.id ?? 'aoi'}`"
      @click="expanded = !expanded"
    >
      <span class="section-title">{{ config.sectionTitle }}</span>
      <FontAwesomeIcon
        :icon="expanded ? faChevronUp : faChevronDown"
        class="section-toggle__icon"
        aria-hidden="true"
      />
    </button>

    <div
      v-show="expanded"
      :id="`detail-panel-content-${detail.id ?? 'aoi'}`"
      class="details-card"
    >
      <div
        v-if="headerFields.length"
        class="header-detail"
      >
        <div
          v-for="field in headerFields"
          :key="field.key"
          class="field"
          :class="{ 'field--wide': field.key === 'id' }"
        >
          <p>{{ field.label }}</p>
          <strong>{{ readFieldValue(field) }}</strong>
        </div>
      </div>

      <hr
        v-if="headerFields.length"
        class="divider"
      />

      <h3 class="property-title">{{ config.areaOfInterestSectionTitle }}</h3>

      <div class="property-rows">
        <div
          v-for="(row, rowIndex) in propertyRows"
          :key="rowIndex"
          class="property-row"
        >
          <div
            v-for="field in row"
            :key="field.key"
            class="field"
          >
            <p>{{ field.label }}</p>
            <strong>{{ readFieldValue(field) }}</strong>
          </div>
        </div>
      </div>

      <div v-if="otherIds.length" class="other-aois">
        <p class="other-aois__label">Outros próximos</p>
        <div class="other-aois__list">
          <button
            v-for="id in otherIds"
            :key="id"
            type="button"
            class="other-aois__btn"
            @click="onSelectOther(id)"
          >
            {{ id }}
          </button>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="br-button secondary"
          :disabled="!detail.id || !config.featuresDownload.enabled || downloadingFeatures"
          :title="config.featuresDownload.label"
          @click="onDownloadFeatures"
        >
          <LoadingDotsComponent v-if="downloadingFeatures" />
          <template v-else>{{ config.featuresDownload.label }}</template>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.details-panel {
  margin: 20px 0 24px;
  border: 1px solid #70707045;
  border-radius: 8px;
  padding: 15px;
  background: #fff;
}

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.section-toggle:focus-visible {
  outline: 2px solid #42916e;
  outline-offset: 2px;
}

.section-title {
  margin: 0;
  font-size: 20px;
  color: #42916e;
  font-weight: 600;
  text-transform: uppercase;
}

.section-toggle__icon {
  color: #42916e;
  font-size: 16px;
  flex-shrink: 0;
  margin-left: 12px;
}

.details-card {
  margin-top: 12px;
  padding: 4px 15px 15px;
}

.header-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 40px;
}

.header-detail .field--wide {
  flex: 1 1 280px;
  min-width: 200px;
}

.property-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 400;
  color: #707070;
}

.property-rows {
  margin-bottom: 28px;
}

.property-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px 32px;
  margin-bottom: 30px;
}

.property-row:last-child {
  margin-bottom: 0;
}

.property-row .field {
  min-width: 0;
}

.field p {
  margin: 0 0 7px;
  color: #707070;
  font-size: 15px;
}

.field strong {
  color: #707070;
  font-size: 17px;
  font-weight: 600;
}

.divider {
  border: none;
  border-top: 1px solid #e5e5e5;
  margin: 20px 0;
}

.other-aois {
  margin: 0 0 24px;
}

.other-aois__label {
  margin: 0 0 10px;
  color: #707070;
  font-size: 15px;
}

.other-aois__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.other-aois__btn {
  background: #fff;
  border: 1px solid #1351b4;
  color: #1351b4;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.other-aois__btn:hover {
  background: #e8f0fe;
}

.actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 16px;
}

.details-card .actions .br-button {
  flex: 0 0 auto;
  width: auto;
  max-width: max-content;
  align-self: flex-start;
}

.actions .br-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media screen and (max-width: 900px) {
  .details-card {
    padding: 16px;
  }

  .property-row {
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .property-row .field {
    min-width: 0;
  }
}
</style>
