<script setup lang="ts">
import { downloadsUiConfig, formatDownloadLabel } from '@/config/downloadsUi'
import LoadingDotsComponent from '@/components/LoadingDotsComponent.vue'
import { peekInstallationConfig } from '@/services/configService'
import type { DownloadAvailabilityStatus, DownloadItemDTO } from '@/types/download'
import { formatDate, formatDateTime } from '@/utils/dateFormat'

const props = defineProps<{
  items: DownloadItemDTO[]
  loadingButtons?: Record<string, boolean>
}>()

const emit = defineEmits<{
  download: [item: DownloadItemDTO, format: string]
}>()

const ui = downloadsUiConfig
const formats = peekInstallationConfig().formats

function buttonKey(themeCode: string, format: string): string {
  return `${themeCode}:${format}`
}

function isLoading(themeCode: string, format: string): boolean {
  return Boolean(props.loadingButtons?.[buttonKey(themeCode, format)])
}

function statusTitle(status: DownloadAvailabilityStatus): string {
  return ui.statusTitles[status] ?? status
}

function formatTooltip(status: DownloadAvailabilityStatus): string | undefined {
  if (status === 'unavailable') {
    return ui.unavailableFormatTooltip
  }
  return statusTitle('available')
}

function formatLastUpdate(value: string | null): string {
  if (!value) return ui.emptyValue
  if (value.includes('T') || /\d{2}:\d{2}/.test(value)) {
    return formatDateTime(value, formats.dateTime)
  }
  return formatDate(value, formats.date)
}
</script>

<template>
  <div class="themes-table-wrap">
    <table class="themes-table">
      <thead>
        <tr class="header-font">
          <th class="col-topic">{{ ui.columns.topic }}</th>
          <th class="col-services">{{ ui.columns.services }}</th>
          <th class="col-update">{{ ui.columns.lastUpdate }}</th>
          <th class="col-file-generate">{{ ui.columns.lastFileGenerate }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.themeCode">
          <td class="col-topic">{{ item.themeName }}</td>
          <td class="col-services">
            <div class="btn-geosservices-table">
              <span
                v-for="formatStatus in item.formats"
                :key="formatStatus.format"
                class="download-format-wrap"
                :title="formatTooltip(formatStatus.status)"
              >
                <button
                  type="button"
                  class="download-theme"
                  :disabled="
                    formatStatus.status !== 'available' ||
                    isLoading(item.themeCode, formatStatus.format)
                  "
                  @click="emit('download', item, formatStatus.format)"
                >
                  <LoadingDotsComponent
                    v-if="isLoading(item.themeCode, formatStatus.format)"
                  />
                  <span v-else>{{ formatDownloadLabel(formatStatus.format) }}</span>
                </button>
              </span>
            </div>
          </td>
          <td class="col-update">{{ formatLastUpdate(item.lastUpdate) }}</td>
          <td class="col-file-generate">{{ formatLastUpdate(item.lastFileGenerated) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.themes-table-wrap {
  width: 100%;
  overflow-x: auto;
  margin-top: 8px;
  margin-bottom: 24px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.themes-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  background: #fff;
  empty-cells: show;
}

.themes-table th,
.themes-table td {
  padding: 16px 12px;
  border-bottom: 1px solid #ebeef5;
  color: #606266;
  font-size: 14px;
  vertical-align: middle;
}

.themes-table th {
  padding-bottom: 18px;
  background: #fff;
}

.header-font th {
  font-size: 16px;
  font-weight: 600;
  color: #0a2f6b;
  white-space: nowrap;
}

.col-topic {
  width: 34%;
  text-align: left;
}

.themes-table th.col-services,
.themes-table td.col-services {
  width: 22%;
  text-align: center;
}

.col-update,
.col-file-generate {
  width: 22%;
  min-width: 160px;
  text-align: left;
  white-space: nowrap;
}

.btn-geosservices-table {
  display: inline-flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 48px;
}

.download-format-wrap {
  display: inline-flex;
  align-items: center;
}

.download-format-wrap:has(.download-theme:disabled) {
  cursor: help;
}

.download-theme {
  min-width: 40px;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  color: #0a2f6b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.download-theme:hover:not(:disabled) {
  text-decoration: underline;
}

.download-theme:disabled {
  color: #a1b3d1;
  cursor: not-allowed;
  text-decoration: none;
}

@media screen and (max-width: 984px) {
  .btn-geosservices-table {
    gap: 20px;
  }
}
</style>
