import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import GeoservicesView from '@/views/GeoservicesView.vue'
import DownloadsFilterPanel from '@/components/DownloadsFilterPanel.vue'
import {
  getDownloadThemes,
  searchDownloads,
  downloadThemeFile,
  triggerBrowserDownload,
} from '@/services/downloadService'

async function mountGeoservicesView() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/geoservices', component: GeoservicesView },
      { path: '/about', component: { template: '<div />' } },
    ],
  })
  await router.push('/geoservices')
  await router.isReady()

  const wrapper = mount(GeoservicesView, {
    global: {
      plugins: [router],
    },
  })
  await flushPromises()
  return wrapper
}

vi.mock('@/services/downloadService', () => ({
  getDownloadThemes: vi.fn(),
  searchDownloads: vi.fn(),
  downloadThemeFile: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}))

vi.mock('@/services/configService', async () => {
  const { FALLBACK_INSTALLATION_CONFIG } = await import('@/config/installationConfigFallback')
  return {
    getInstallationConfig: vi.fn().mockResolvedValue(FALLBACK_INSTALLATION_CONFIG),
    peekInstallationConfig: vi.fn().mockReturnValue(FALLBACK_INSTALLATION_CONFIG),
  }
})

vi.mock('@/services/territoryService', () => ({
  getTerritoryOptions: vi.fn().mockResolvedValue([{ id: '3', name: 'Centro-Oeste' }]),
}))

vi.mock('@fortawesome/vue-fontawesome', () => ({
  FontAwesomeIcon: {
    name: 'FontAwesomeIcon',
    template: '<i />',
  },
}))

describe('GeoservicesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDownloadThemes).mockResolvedValue([
      { code: 'theme_alpha', name: 'Theme Alpha', formats: ['csv'], enabled: true },
    ])
    vi.mocked(searchDownloads).mockResolvedValue([
      {
        themeCode: 'theme_alpha',
        themeName: 'Theme Alpha',
        formats: [{ format: 'csv', status: 'available' }],
        lastUpdate: '2026-06-01',
        lastFileGenerated: '2026-06-02T10:00:00Z',
      },
    ])
  })

  it('should load themes and search downloads from filter panel', async () => {
    const wrapper = await mountGeoservicesView()

    expect(getDownloadThemes).toHaveBeenCalledTimes(1)

    const panel = wrapper.findComponent(DownloadsFilterPanel)
    await panel.vm.$emit('search', {
      level1: '3',
      level2: 'DF',
      level3: '',
      theme: '',
    })
    await flushPromises()

    expect(searchDownloads).toHaveBeenCalledWith({
      level1: '3',
      level2: 'DF',
      level3: null,
      theme: null,
    })
    expect(wrapper.text()).toContain('Theme Alpha')
    expect(wrapper.text()).toContain('CSV')
    expect(wrapper.text()).not.toContain('GPKG')
    expect(wrapper.text()).toContain('01/06/2026')
  })

  it('should hide results table when any filter value changes', async () => {
    const wrapper = await mountGeoservicesView()

    const panel = wrapper.findComponent(DownloadsFilterPanel)
    await panel.vm.$emit('search', {
      level1: '3',
      level2: 'DF',
      level3: '',
      theme: '',
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Theme Alpha')

    await panel.vm.$emit('selection-change', {
      level1: '3',
      level2: 'DF',
      level3: '5300108',
      theme: '',
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Theme')
    expect(wrapper.text()).not.toContain('Services')
    expect(wrapper.text()).not.toContain('Last update')
    expect(wrapper.text()).not.toContain('Last file generate')
    expect(wrapper.text()).not.toContain('Theme Alpha')
  })

  it('should download available CSV format', async () => {
    vi.mocked(downloadThemeFile).mockResolvedValue({
      blob: new Blob(['ok']),
      fileName: 'DF_theme_alpha.csv',
    })

    const wrapper = await mountGeoservicesView()

    const panel = wrapper.findComponent(DownloadsFilterPanel)
    await panel.vm.$emit('search', {
      level1: '3',
      level2: 'DF',
      level3: '',
      theme: 'theme_alpha',
    })
    await flushPromises()

    const csvButton = wrapper
      .findAll('button.download-theme')
      .find((button) => button.text().includes('CSV'))

    expect(csvButton?.attributes('disabled')).toBeUndefined()

    await csvButton!.trigger('click')
    await flushPromises()

    expect(downloadThemeFile).toHaveBeenCalledWith({
      level2: 'DF',
      level3: null,
      theme: 'theme_alpha',
      format: 'csv',
    })
    expect(triggerBrowserDownload).toHaveBeenCalled()
  })
})
