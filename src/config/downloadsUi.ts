import type { InstallationConfig } from '@/types/installationConfig'
import { FALLBACK_INSTALLATION_CONFIG } from '@/config/installationConfigFallback'
import { buildHierarchyFieldsByKey, buildSearchFormConfig } from '@/config/searchHierarchy'

export interface DownloadsUiConfig {
  bannerTitle: string
  level1Title: string
  level2Title: string
  filterByTitle: string
  level3Label: string
  level3Placeholder: string
  themeLabel: string
  themePlaceholder: string
  searchButton: string
  clearButton: string
  noResultsMessage: string
  columns: {
    topic: string
    services: string
    lastUpdate: string
    lastFileGenerate: string
  }
  emptyValue: string
  formatLabels: Record<string, string>
  statusTitles: Record<string, string>
  unavailableFormatTooltip: string
}

const STATIC_DOWNLOADS_UI = {
  bannerTitle: 'Downloads',
  searchButton: 'Search',
  clearButton: 'Clear',
  noResultsMessage: 'No themes found for the selected filter.',
  columns: {
    topic: 'Theme',
    services: 'Services',
    lastUpdate: 'Last update',
    lastFileGenerate: 'Last file generate',
  },
  emptyValue: '—',
  formatLabels: {
    csv: 'CSV',
  } as Record<string, string>,
  statusTitles: {
    available: 'Download',
    unavailable: 'No data available for the selected filter.',
  } as Record<string, string>,
  unavailableFormatTooltip: 'No data available for the selected filter.',
}

export function resolveDownloadsUiConfig(
  installation: InstallationConfig = FALLBACK_INSTALLATION_CONFIG,
): DownloadsUiConfig {
  const fields = buildHierarchyFieldsByKey(installation)
  const screen = buildSearchFormConfig(installation, 'downloads')
  const downloadsScreen = installation.screens.downloads

  return {
    ...STATIC_DOWNLOADS_UI,
    level1Title:
      downloadsScreen.level1SectionTitle ??
      `Select the ${fields.level1.label} you want to access for Downloads`,
    level2Title:
      downloadsScreen.level2SectionTitle ??
      `Options for the selected ${fields.level1.label}`,
    filterByTitle: downloadsScreen.filterByTitle ?? 'Filter by:',
    level3Label: fields.level3.label,
    level3Placeholder: fields.level3.placeholder,
    themeLabel: screen.theme?.label ?? 'Theme',
    themePlaceholder: screen.theme?.placeholder ?? 'All themes',
  }
}

export const downloadsUiConfig = resolveDownloadsUiConfig()

export function formatDownloadLabel(format: string): string {
  return downloadsUiConfig.formatLabels[format] ?? format.toUpperCase()
}
