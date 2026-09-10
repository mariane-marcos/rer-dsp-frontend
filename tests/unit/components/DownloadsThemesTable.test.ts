import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DownloadsThemesTable from '@/components/DownloadsThemesTable.vue'
import { resolveDownloadsUiConfig } from '@/config/downloadsUi'
import type { DownloadItemDTO } from '@/types/download'

const items: DownloadItemDTO[] = [
  {
    themeCode: 'theme_alpha',
    themeName: 'Theme Alpha',
    formats: [{ format: 'csv', status: 'available' }],
    lastUpdate: '2026-06-01',
    lastFileGenerated: '2026-06-02T10:00:00Z',
  },
]

describe('DownloadsThemesTable', () => {
  it('should render CP-like columns and CSV download action without GPKG', () => {
    const wrapper = mount(DownloadsThemesTable, {
      props: { items },
    })

    expect(wrapper.text()).toContain('Theme')
    expect(wrapper.text()).toContain('Services')
    expect(wrapper.text()).toContain('Last update')
    expect(wrapper.text()).toContain('Last file generate')
    expect(wrapper.text()).toContain('Theme Alpha')
    expect(wrapper.text()).toContain('01/06/2026')
    expect(wrapper.text()).toContain('02/06/2026')
    expect(wrapper.text()).toContain('CSV')
    expect(wrapper.text()).not.toContain('GPKG')

    const csvButton = wrapper.findAll('button.download-theme').find((button) =>
      button.text().includes('CSV'),
    )

    expect(csvButton?.classes()).toContain('download-theme')
    expect(csvButton?.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.btn-geosservices-table').exists()).toBe(true)
  })

  it('should emit download for available format', async () => {
    const wrapper = mount(DownloadsThemesTable, {
      props: { items },
    })

    const csvButton = wrapper.findAll('button.download-theme').find((button) =>
      button.text().includes('CSV'),
    )
    await csvButton!.trigger('click')

    expect(wrapper.emitted('download')?.[0]).toEqual([items[0], 'csv'])
  })

  it('should show informative tooltip when csv is unavailable for the selected filter', () => {
    const unavailableItems: DownloadItemDTO[] = [
      {
        themeCode: 'area_of_interest',
        themeName: 'Area of interest',
        formats: [{ format: 'csv', status: 'unavailable' }],
        lastUpdate: null,
        lastFileGenerated: null,
      },
    ]

    const wrapper = mount(DownloadsThemesTable, {
      props: { items: unavailableItems },
    })

    const formatWrap = wrapper.find('.download-format-wrap')
    expect(formatWrap.attributes('title')).toBe(
      resolveDownloadsUiConfig().unavailableFormatTooltip,
    )
    expect(wrapper.find('button.download-theme').attributes('disabled')).toBeDefined()
  })

  it('should keep last file generate column visible when the file is missing', () => {
    const wrapper = mount(DownloadsThemesTable, {
      props: {
        items: [
          {
            themeCode: 'theme_alpha',
            themeName: 'Theme Alpha',
            formats: [{ format: 'csv', status: 'available' }],
            lastUpdate: '2026-06-01',
            lastFileGenerated: null,
          },
        ],
      },
    })

    expect(wrapper.find('thead .col-file-generate').text()).toBe(
      resolveDownloadsUiConfig().columns.lastFileGenerate,
    )
    expect(wrapper.find('thead .col-file-generate').isVisible()).toBe(true)
    expect(wrapper.find('tbody .col-file-generate').text()).toBe(
      resolveDownloadsUiConfig().emptyValue,
    )
    expect(wrapper.find('tbody .col-file-generate').isVisible()).toBe(true)
  })
})
