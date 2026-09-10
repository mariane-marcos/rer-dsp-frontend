import { describe, expect, it } from 'vitest'
import {
  formatDownloadLabel,
  resolveDownloadsUiConfig,
} from '@/config/downloadsUi'
import { FALLBACK_INSTALLATION_CONFIG } from '@/config/installationConfigFallback'
import type { InstallationConfig } from '@/types/installationConfig'

describe('downloadsUi', () => {
  describe('resolveDownloadsUiConfig', () => {
    it('should use configured section titles when provided', () => {
      const config = resolveDownloadsUiConfig(FALLBACK_INSTALLATION_CONFIG)

      expect(config.level1Title).toBe(
        'Select the level 1 you want to access for Downloads',
      )
      expect(config.level2Title).toBe('Options for the selected level 1')
      expect(config.filterByTitle).toBe('Filter by:')
      expect(config.themeLabel).toBe('Theme')
      expect(config.themePlaceholder).toBe('All themes')
    })

    it('should build section titles from hierarchy labels when titles are missing', () => {
      const installation: InstallationConfig = {
        ...FALLBACK_INSTALLATION_CONFIG,
        hierarchy: [
          { key: 'level1', label: 'Country', placeholder: 'Select country', order: 1 },
          { key: 'level2', label: 'Region', placeholder: 'Select region', order: 2 },
          { key: 'level3', label: 'District', placeholder: 'Select district', order: 3 },
        ],
        screens: {
          ...FALLBACK_INSTALLATION_CONFIG.screens,
          downloads: {
            ...FALLBACK_INSTALLATION_CONFIG.screens.downloads,
            level1SectionTitle: null,
            level2SectionTitle: undefined,
            filterByTitle: null,
          },
        },
      }

      const config = resolveDownloadsUiConfig(installation)

      expect(config.level1Title).toBe(
        'Select the Country you want to access for Downloads',
      )
      expect(config.level2Title).toBe('Options for the selected Country')
      expect(config.filterByTitle).toBe('Filter by:')
      expect(config.level3Label).toBe('District')
      expect(config.level3Placeholder).toBe('Select district')
    })

    it('should fallback theme labels when theme field is absent', () => {
      const installation: InstallationConfig = {
        ...FALLBACK_INSTALLATION_CONFIG,
        screens: {
          ...FALLBACK_INSTALLATION_CONFIG.screens,
          downloads: {
            ...FALLBACK_INSTALLATION_CONFIG.screens.downloads,
            theme: null,
          },
        },
      }

      const config = resolveDownloadsUiConfig(installation)

      expect(config.themeLabel).toBe('Theme')
      expect(config.themePlaceholder).toBe('All themes')
    })
  })

  describe('formatDownloadLabel', () => {
    it('should use configured label for known formats', () => {
      expect(formatDownloadLabel('csv')).toBe('CSV')
    })

    it('should uppercase unknown formats', () => {
      expect(formatDownloadLabel('shp')).toBe('SHP')
    })
  })
})
