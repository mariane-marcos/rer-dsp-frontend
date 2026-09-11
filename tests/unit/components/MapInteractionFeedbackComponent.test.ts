import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MapInteractionFeedbackComponent from '@/components/MapInteractionFeedbackComponent.vue'

vi.mock('@fortawesome/vue-fontawesome', () => ({
  FontAwesomeIcon: {
    name: 'FontAwesomeIcon',
    template: '<i />',
  },
}))

describe('MapInteractionFeedbackComponent', () => {
  it('should render no-aoi feedback content', () => {
    const wrapper = mount(MapInteractionFeedbackComponent, {
      props: { kind: 'no-aoi' },
    })

    expect(wrapper.text()).toContain('No area of interest found')
    expect(wrapper.text()).toContain('Try selecting another location on the map.')
    expect(wrapper.find('[role="status"]').attributes('aria-label')).toBe(
      'No area of interest found',
    )
  })

  it('should render zoom-required feedback content', () => {
    const wrapper = mount(MapInteractionFeedbackComponent, {
      props: { kind: 'zoom-required' },
    })

    expect(wrapper.text()).toContain('Zoom in to select an area of interest')
    expect(wrapper.text()).toContain(
      'Get closer to the location you want to inspect and try again.',
    )
    expect(wrapper.find('[role="status"]').attributes('aria-label')).toBe(
      'Zoom in to select an area of interest',
    )
  })
})
