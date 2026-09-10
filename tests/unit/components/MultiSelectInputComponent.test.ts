import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MultiSelectInputComponent from '@/components/MultiSelectInputComponent.vue'

const items = [
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'GO', label: 'Goiás' },
  { value: 'SP', label: 'São Paulo' },
]

function mountMultiSelect(props: Record<string, unknown> = {}) {
  return mount(MultiSelectInputComponent, {
    props: {
      label: 'Estado',
      placeholder: 'Selecione',
      items,
      ...props,
    },
  })
}

describe('MultiSelectInputComponent', () => {
  it('should show placeholder when no value is selected', () => {
    const wrapper = mountMultiSelect()

    expect(wrapper.text()).toContain('Selecione')
  })

  it('should open dropdown and emit selected values', async () => {
    const wrapper = mountMultiSelect()

    await wrapper.find('.multi-select__trigger').trigger('click')
    expect(wrapper.find('.multi-select__dropdown').exists()).toBe(true)

    const checkboxes = wrapper.findAll('.multi-select__option input[type="checkbox"]')
    await checkboxes[0].setValue(true)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['DF']])
  })

  it('should remove a selected value when checkbox is unchecked', async () => {
    const wrapper = mountMultiSelect({ modelValue: ['DF', 'GO'] })

    await wrapper.find('.multi-select__trigger').trigger('click')

    const checkboxes = wrapper.findAll('.multi-select__option input[type="checkbox"]')
    await checkboxes[0].setValue(false)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['GO']])
  })

  it('should filter options by label', async () => {
    const wrapper = mountMultiSelect()

    await wrapper.find('.multi-select__trigger').trigger('click')
    await wrapper.find('.multi-select__filter').setValue('goi')

    const visibleOptions = wrapper.findAll('.multi-select__option span')
    expect(visibleOptions.some((option) => option.text() === 'Goiás')).toBe(true)
    expect(visibleOptions.some((option) => option.text() === 'Distrito Federal')).toBe(false)
  })

  it('should show empty state when filter has no matches', async () => {
    const wrapper = mountMultiSelect()

    await wrapper.find('.multi-select__trigger').trigger('click')
    await wrapper.find('.multi-select__filter').setValue('inexistente')

    expect(wrapper.find('.multi-select__empty').text()).toBe('No options')
  })

  it('should remove chip value when chip button is clicked', async () => {
    const wrapper = mountMultiSelect({ modelValue: ['DF', 'GO'] })

    const chipButton = wrapper.find('.multi-select__chip')
    await chipButton.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['GO']])
  })

  it('should show single-item summary and multi-select summary', async () => {
    const single = mountMultiSelect({ modelValue: ['DF'] })
    expect(single.find('.multi-select__toggle').attributes('aria-label')).toBe('Distrito Federal')

    const multiple = mountMultiSelect({ modelValue: ['DF', 'GO'] })
    expect(multiple.find('.multi-select__toggle').attributes('aria-label')).toBe('2 selected')
  })

  it('should fallback to raw value label for unknown selections', () => {
    const wrapper = mountMultiSelect({ modelValue: ['UNKNOWN'] })

    expect(wrapper.text()).toContain('UNKNOWN')
  })

  it('should not open or mutate values when disabled', async () => {
    const wrapper = mountMultiSelect({ disabled: true, modelValue: ['DF'] })

    await wrapper.find('.multi-select__trigger').trigger('click')
    expect(wrapper.find('.multi-select__dropdown').exists()).toBe(false)

    await wrapper.find('.multi-select__chip').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('should close dropdown when clicking outside', async () => {
    const wrapper = mountMultiSelect()

    await wrapper.find('.multi-select__trigger').trigger('click')
    expect(wrapper.find('.multi-select__dropdown').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.multi-select__dropdown').exists()).toBe(false)
  })
})
