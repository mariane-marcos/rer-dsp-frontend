import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailSearchComponent from '@/components/DetailSearchComponent.vue'
import type { DetailByIdentifierDTO } from '@/types/totalizer'
import { FALLBACK_INSTALLATION_CONFIG } from '@/config/installationConfigFallback'
import { peekInstallationConfig, resetInstallationConfigCache } from '@/services/configService'
import type { InstallationConfig } from '@/types/installationConfig'

vi.mock('@fortawesome/vue-fontawesome', () => ({
  FontAwesomeIcon: {
    name: 'FontAwesomeIcon',
    template: '<i />',
  },
}))

vi.mock('@/services/configService', async () => {
  const actual = await vi.importActual<typeof import('@/services/configService')>(
    '@/services/configService',
  )
  return {
    ...actual,
    peekInstallationConfig: vi.fn(),
  }
})

const ptbrInstallation: InstallationConfig = {
  ...FALLBACK_INSTALLATION_CONFIG,
  hierarchy: [
    { key: 'level1', label: 'Região', placeholder: 'Selecione uma região', order: 1 },
    { key: 'level2', label: 'Estado', placeholder: 'Selecione um estado', order: 2 },
    { key: 'level3', label: 'Município', placeholder: 'Selecione um município', order: 3 },
  ],
  screens: {
    ...FALLBACK_INSTALLATION_CONFIG.screens,
    home: {
      ...FALLBACK_INSTALLATION_CONFIG.screens.home,
      identifier: {
        key: 'identifier',
        label: 'Identificador',
        placeholder: 'Informe o identificador',
      },
      detail: {
        sectionTitle: 'Detalhes da consulta',
        areaOfInterestSectionTitle: 'Dados da área de interesse',
        registrationDateLabel: 'Data de registro',
        alterationDateLabel: 'Data de alteração',
        latitudeLabel: 'Latitude',
        longitudeLabel: 'Longitude',
        areaLabel: 'Área',
        featuresDownloadLabel: 'Baixar feições',
      },
    },
  },
}

const detail: DetailByIdentifierDTO = {
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
}

describe('DetailSearchComponent', () => {
  beforeEach(() => {
    vi.mocked(peekInstallationConfig).mockReturnValue(ptbrInstallation)
  })

  afterEach(() => {
    resetInstallationConfigCache()
    vi.clearAllMocks()
  })

  it('should render section titles and main values from config', () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail },
    })

    expect(wrapper.text()).toContain('Detalhes da consulta')
    expect(wrapper.text()).toContain('Dados da área de interesse')
    expect(wrapper.text()).toContain('DF123456789012')
    expect(wrapper.text()).toContain('Brasília')
    expect(wrapper.text()).toContain('Distrito Federal')
    expect(wrapper.text()).toContain('120.50 ha')
    expect(wrapper.find('.details-card').isVisible()).toBe(true)
  })

  it('should collapse and expand detail content when header is clicked', async () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail },
    })

    const toggle = wrapper.get('.section-toggle')
    const content = wrapper.get('.details-card')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(content.isVisible()).toBe(true)

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(content.attributes('style') ?? '').toContain('display: none')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(content.isVisible()).toBe(true)
  })

  it('should use installation labels for identifier and hierarchy', () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail },
    })

    expect(wrapper.text()).toContain('Identificador')
    expect(wrapper.text()).toContain('Estado')
    expect(wrapper.text()).toContain('Município')
    expect(wrapper.text()).not.toContain('Level 2')
    expect(wrapper.text()).not.toContain('Level 3')
    expect(wrapper.text()).not.toContain('Identifier')
  })

  it('should show alteration date and hide centroid and fiscal modules', () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail },
    })

    expect(wrapper.text()).toContain('Data de alteração')
    expect(wrapper.text()).toContain('Data de registro')
    expect(wrapper.text()).toContain('15/06/2024')
    expect(wrapper.text()).toContain('10/01/2020')
    expect(wrapper.text()).not.toContain('Centroid coordinates')
    expect(wrapper.text()).not.toContain('Reference modules')
  })

  it('should render property fields in separate rows', () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail },
    })

    const rows = wrapper.findAll('.property-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Município')
    expect(rows[0].text()).toContain('Estado')
    expect(rows[0].text()).toContain('Latitude')
    expect(rows[1].text()).toContain('Longitude')
    expect(rows[1].text()).toContain('Área')
  })

  it('should render features download button enabled and emit on click', async () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail },
    })

    const button = wrapper.find('.actions .br-button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('Baixar feições')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    expect(wrapper.emitted('download-features')).toEqual([['DF123456789012']])
  })

  it('should disable features download button when detail has no id', () => {
    const wrapper = mount(DetailSearchComponent, {
      props: { detail: { ...detail, id: undefined } },
    })

    const button = wrapper.find('.actions .br-button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('should render exclusive fields from attributes and omit unused structural values', async () => {
    vi.mocked(peekInstallationConfig).mockReturnValue(exclusiveInstallation)

    const wrapper = mount(DetailSearchComponent, {
      props: {
        detail: {
          ...detail,
          otherIds: ['GO-1'],
          attributes: {
            id: 'DF123456789012',
            nome: 'Sample property',
            'calculated.latitude': '-15.793889',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Identificador')
    expect(wrapper.text()).toContain('Property name')
    expect(wrapper.text()).toContain('Sample property')
    expect(wrapper.text()).toContain('Centroid latitude')
    expect(wrapper.text()).toContain('-15.793889')
    expect(wrapper.text()).not.toContain('Município')
    expect(wrapper.text()).not.toContain('Brasília')
    expect(wrapper.text()).not.toContain('Data de registro')
    expect(wrapper.find('.header-detail').exists()).toBe(false)
    expect(wrapper.text()).toContain('Outros próximos')
    expect(wrapper.text()).toContain('GO-1')

    const button = wrapper.find('.actions .br-button')
    expect(button.text()).toContain('Baixar feições')
    await button.trigger('click')
    expect(wrapper.emitted('download-features')).toEqual([['DF123456789012']])
  })

  it('should format perimeter_m attribute with two decimal places', () => {
    vi.mocked(peekInstallationConfig).mockReturnValue({
      ...ptbrInstallation,
      screens: {
        ...ptbrInstallation.screens,
        home: {
          ...ptbrInstallation.screens.home,
          detail: {
            ...ptbrInstallation.screens.home.detail!,
            fields: [{ field: 'perimeter_m', label: 'Perímetro em metros(m)' }],
          },
        },
      },
    })

    const wrapper = mount(DetailSearchComponent, {
      props: {
        detail: {
          ...detail,
          attributes: {
            perimeter_m: 53944.7195802754,
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Perímetro em metros(m)')
    expect(wrapper.text()).toContain('53944.72')
  })
})

const exclusiveInstallation: InstallationConfig = {
  ...ptbrInstallation,
  screens: {
    ...ptbrInstallation.screens,
    home: {
      ...ptbrInstallation.screens.home,
      detail: {
        ...ptbrInstallation.screens.home.detail!,
        fields: [
          { field: 'id', label: 'Identificador' },
          { field: 'nome', label: 'Property name' },
          { field: 'calculated.latitude', label: 'Centroid latitude' },
        ],
      },
    },
  },
}
