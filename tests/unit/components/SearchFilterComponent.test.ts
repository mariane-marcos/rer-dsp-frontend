import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SearchFilterComponent from '@/components/SearchFilterComponent.vue'
import MultiSelectInputComponent from '@/components/MultiSelectInputComponent.vue'
import { getTerritoryOptions } from '@/services/territoryService'

vi.mock('@/services/territoryService', () => ({
  getTerritoryOptions: vi.fn(),
}))

vi.mock('@fortawesome/vue-fontawesome', () => ({
  FontAwesomeIcon: {
    name: 'FontAwesomeIcon',
    template: '<i />',
  },
}))

describe('SearchFilterComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTerritoryOptions).mockImplementation(async (level, parentId) => {
      if (level === 'level2' && !parentId) {
        return [
          { id: 'DF', name: 'DF - Distrito Federal' },
          { id: 'GO', name: 'GO - Goiás' },
        ]
      }
      if (level === 'level3' && parentId === 'DF') {
        return [
          { id: '5300108', name: 'Brasília' },
          { id: '5300109', name: 'Other' },
        ]
      }
      if (level === 'level3' && parentId === 'GO') {
        return [{ id: '5200050', name: 'Abadia de Goiás' }]
      }
      return []
    })
  })

  it('should load root level options on mount', async () => {
    const wrapper = mount(SearchFilterComponent)
    await flushPromises()

    expect(getTerritoryOptions).toHaveBeenCalledWith('level2')
    expect(wrapper.text()).toContain('Browse registered data')
  })

  it('should emit search with selected filters', async () => {
    const wrapper = mount(SearchFilterComponent)
    await flushPromises()

    const multiSelects = wrapper.findAllComponents(MultiSelectInputComponent)
    expect(multiSelects.length).toBeGreaterThanOrEqual(1)
    await multiSelects[0].vm.$emit('update:modelValue', ['DF'])
    await flushPromises()

    expect(getTerritoryOptions).toHaveBeenCalledWith('level3', 'DF')

    const buttons = wrapper.findAll('button')
    const searchButton = buttons.find((button) => button.text().includes('Search'))
    await searchButton!.trigger('click')

    expect(wrapper.emitted('search')).toBeTruthy()
    expect(wrapper.emitted('search')?.[0]?.[0]).toMatchObject({
      level2: ['DF'],
      level3: [],
      identifier: '',
      theme: '',
    })
  })

  it('should allow selecting multiple level2 and level3 values', async () => {
    const wrapper = mount(SearchFilterComponent)
    await flushPromises()

    const multiSelects = wrapper.findAllComponents(MultiSelectInputComponent)
    await multiSelects[0].vm.$emit('update:modelValue', ['DF', 'GO'])
    await flushPromises()

    expect(getTerritoryOptions).toHaveBeenCalledWith('level3', 'DF')
    expect(getTerritoryOptions).toHaveBeenCalledWith('level3', 'GO')

    await multiSelects[1].vm.$emit('update:modelValue', ['5300108', '5200050'])
    await flushPromises()

    const searchButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Search'))
    await searchButton!.trigger('click')

    expect(wrapper.emitted('search')?.[0]?.[0]).toMatchObject({
      level2: ['DF', 'GO'],
      level3: ['5300108', '5200050'],
    })
  })

  it('should emit clear and reset form', async () => {
    const wrapper = mount(SearchFilterComponent)
    await flushPromises()

    const multiSelects = wrapper.findAllComponents(MultiSelectInputComponent)
    await multiSelects[0].vm.$emit('update:modelValue', ['DF'])
    await flushPromises()

    const clearButton = wrapper.findAll('button').find((button) => button.text().includes('Clear'))
    await clearButton!.trigger('click')

    expect(wrapper.emitted('clear')).toBeTruthy()
    expect(wrapper.vm.form.level2).toEqual([])
    expect(wrapper.vm.form.level3).toEqual([])
  })

  it('should show clear button when session is active without form values', async () => {
    const wrapper = mount(SearchFilterComponent, {
      props: { sessionActive: true },
    })
    await flushPromises()

    const clearButton = wrapper.findAll('button').find((button) => button.text().includes('Clear'))
    expect(clearButton).toBeTruthy()
  })

  it('should apply identifier selection to form', async () => {
    const wrapper = mount(SearchFilterComponent)
    await flushPromises()

    wrapper.vm.applyIdentifierSelection('DF123456789012')

    expect(wrapper.vm.form.identifier).toBe('DF123456789012')
  })

  it('should apply territory selection for level2 and level3', async () => {
    const wrapper = mount(SearchFilterComponent)
    await flushPromises()

    await wrapper.vm.applyTerritorySelection({
      level2Id: 'DF',
      level3Id: '5300108',
      level2Label: 'DF - Distrito Federal',
      level3Label: 'Brasília',
    })
    await flushPromises()

    expect(getTerritoryOptions).toHaveBeenCalledWith('level3', 'DF')
    expect(wrapper.vm.form.level2).toEqual(['DF'])
    expect(wrapper.vm.form.level3).toEqual(['5300108'])
  })
})
