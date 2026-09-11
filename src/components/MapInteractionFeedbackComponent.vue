<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faLocationCrosshairs,
  faMagnifyingGlassPlus,
} from '@fortawesome/free-solid-svg-icons'

export type MapFeedbackKind = 'no-aoi' | 'zoom-required'

const props = defineProps<{
  kind: MapFeedbackKind
}>()

const contentByKind = {
  'no-aoi': {
    icon: faLocationCrosshairs,
    title: 'No area of interest found',
    message: 'Try selecting another location on the map.',
  },
  'zoom-required': {
    icon: faMagnifyingGlassPlus,
    title: 'An area of interest cannot be selected at this zoom level',
    message: 'Get closer to the location you want to inspect and try again.',
  },
} as const

const content = computed(() => contentByKind[props.kind])
</script>

<template>
  <section
    class="map-feedback-panel"
    role="status"
    aria-live="polite"
    :aria-label="content.title"
  >
    <FontAwesomeIcon
      :icon="content.icon"
      class="map-feedback-panel__icon"
      aria-hidden="true"
    />
    <div class="map-feedback-panel__text">
      <p class="map-feedback-panel__title">{{ content.title }}</p>
      <p class="map-feedback-panel__message">{{ content.message }}</p>
    </div>
  </section>
</template>

<style scoped>
.map-feedback-panel {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin: 0 0 24px;
  padding: 16px 20px;
  border: none;
  border-left: 4px solid var(--dsp-green, #42916e);
  border-radius: 0 8px 8px 0;
  background: #fff;
}

.map-feedback-panel__icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 22px;
  color: var(--dsp-green, #42916e);
}

.map-feedback-panel__text {
  min-width: 0;
}

.map-feedback-panel__title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: #333333;
}

.map-feedback-panel__message {
  margin: 0;
  font-size: 15px;
  color: #707070;
}
</style>
