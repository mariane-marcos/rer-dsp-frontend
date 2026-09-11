<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import SelectInputComponent from '@/components/SelectInputComponent.vue'
import MultiSelectInputComponent from '@/components/MultiSelectInputComponent.vue'
import TextInputComponent from '@/components/TextInputComponent.vue'
import LoadingDotsComponent from '@/components/LoadingDotsComponent.vue'
import { territoryOptionsToSelectOptions } from '@/adapters/selectOptionAdapters'
import {
  hierarchyFieldsByKey,
  homeSearchConfig,
  resolveHierarchyFields,
  type HierarchyFieldConfig,
  type HierarchyLevelKey,
  type SearchFormConfig,
  type SelectOption,
} from '@/config/searchHierarchy'
import { getTerritoryOptions } from '@/services/territoryService'

export interface SearchFilterPayload {
  level1: string
  level2: string[]
  level3: string[]
  identifier: string
  theme: string
}

export interface TerritorySelection {
  level2Id?: string | null
  level3Id?: string | null
  level2Label?: string | null
  level3Label?: string | null
}

const props = withDefaults(
  defineProps<{
    config?: SearchFormConfig
    hierarchyFields?: Record<HierarchyLevelKey, HierarchyFieldConfig>
    themeOptions?: SelectOption[]
    sessionActive?: boolean
  }>(),
  {
    config: () => homeSearchConfig,
    hierarchyFields: () => hierarchyFieldsByKey,
    themeOptions: () => [],
    sessionActive: false,
  },
)

const emit = defineEmits<{
  search: [payload: SearchFilterPayload]
  clear: []
}>()

const form = reactive<SearchFilterPayload>({
  level1: '',
  level2: [],
  level3: [],
  identifier: '',
  theme: '',
})

const loadingRoot = ref(false)
const loadingChildren = ref(false)
const loadError = ref('')
const suppressHierarchyWatch = ref(false)

const level1Options = ref<SelectOption[]>([])
const level2Options = ref<SelectOption[]>([])
const level3Options = ref<SelectOption[]>([])

const visibleFields = computed(() =>
  resolveHierarchyFields(props.config.hierarchyKeys, props.hierarchyFields),
)

const optionsByLevel = computed<Record<HierarchyLevelKey, SelectOption[]>>(() => ({
  level1: level1Options.value,
  level2: level2Options.value,
  level3: level3Options.value,
}))

function parentKey(key: HierarchyLevelKey): HierarchyLevelKey | null {
  if (key === 'level1') return null
  if (key === 'level2') return 'level1'
  return 'level2'
}

function nextKey(key: HierarchyLevelKey): HierarchyLevelKey | null {
  if (key === 'level1') return 'level2'
  if (key === 'level2') return 'level3'
  return null
}

function setOptionsForLevel(level: HierarchyLevelKey, options: SelectOption[]): void {
  if (level === 'level1') level1Options.value = options
  else if (level === 'level2') level2Options.value = options
  else level3Options.value = options
}

function clearDescendantOptions(level: HierarchyLevelKey): void {
  if (level === 'level1') {
    level2Options.value = []
    level3Options.value = []
    return
  }
  if (level === 'level2') {
    level3Options.value = []
  }
}

function ensureOption(
  level: HierarchyLevelKey,
  id: string,
  label?: string | null,
): void {
  const current =
    level === 'level1'
      ? level1Options.value
      : level === 'level2'
        ? level2Options.value
        : level3Options.value

  if (current.some((option) => option.value === id)) {
    return
  }

  const next = [...current, { value: id, label: label?.trim() || id }]
  setOptionsForLevel(level, next)
}

function isFieldDisabled(key: HierarchyLevelKey): boolean {
  const parent = parentKey(key)
  if (!parent) return false
  if (!props.config.hierarchyKeys.includes(parent)) return false
  const parentValue = form[parent]
  return Array.isArray(parentValue) ? parentValue.length === 0 : !parentValue
}

function hasFormValue(key: HierarchyLevelKey): boolean {
  const value = form[key]
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

async function loadRootOptions(): Promise<void> {
  loadingRoot.value = true
  loadError.value = ''
  try {
    const rootLevel = props.config.hierarchyKeys[0]
    if (!rootLevel) {
      return
    }

    const options = await getTerritoryOptions(rootLevel)
    setOptionsForLevel(rootLevel, territoryOptionsToSelectOptions(options))

    for (const key of props.config.hierarchyKeys.slice(1)) {
      setOptionsForLevel(key, [])
    }
  } catch (error) {
    console.error(error)
    loadError.value =
      'Could not load options. Check if the API is running (config/env.json).'
    level1Options.value = []
    level2Options.value = []
    level3Options.value = []
  } finally {
    loadingRoot.value = false
  }
}

async function loadChildOptions(parentLevel: HierarchyLevelKey, parentId: string): Promise<void> {
  const childLevel = nextKey(parentLevel)
  if (!childLevel || !props.config.hierarchyKeys.includes(childLevel)) {
    return
  }

  if (!parentId) {
    setOptionsForLevel(childLevel, [])
    clearDescendantOptions(childLevel)
    return
  }

  loadingChildren.value = true
  try {
    const options = await getTerritoryOptions(childLevel, parentId)
    setOptionsForLevel(childLevel, territoryOptionsToSelectOptions(options))
    clearDescendantOptions(childLevel)
  } catch (error) {
    console.error(error)
    setOptionsForLevel(childLevel, [])
  } finally {
    loadingChildren.value = false
  }
}

async function loadLevel3OptionsForParents(parentIds: string[]): Promise<void> {
  if (!props.config.hierarchyKeys.includes('level3')) {
    return
  }

  const ids = parentIds.map((id) => id.trim()).filter(Boolean)
  if (!ids.length) {
    setOptionsForLevel('level3', [])
    return
  }

  loadingChildren.value = true
  try {
    const results = await Promise.all(ids.map((id) => getTerritoryOptions('level3', id)))
    const merged = new Map<string, SelectOption>()
    for (const options of results) {
      for (const option of territoryOptionsToSelectOptions(options)) {
        merged.set(option.value, option)
      }
    }
    setOptionsForLevel(
      'level3',
      [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    )
  } catch (error) {
    console.error(error)
    setOptionsForLevel('level3', [])
  } finally {
    loadingChildren.value = false
  }
}

watch(
  () => form.level1,
  (value) => {
    if (suppressHierarchyWatch.value) {
      return
    }
    if (props.config.hierarchyKeys.includes('level1')) {
      form.level2 = []
      form.level3 = []
      void loadChildOptions('level1', value)
    }
  },
)

watch(
  () => form.level2.slice().join(','),
  () => {
    if (suppressHierarchyWatch.value) {
      return
    }
    if (props.config.hierarchyKeys.includes('level3')) {
      form.level3 = []
      void loadLevel3OptionsForParents(form.level2)
    }
  },
)

watch(
  () => props.config.hierarchyKeys.join(','),
  () => {
    void loadRootOptions()
  },
)

onMounted(() => {
  void loadRootOptions()
})

const canSearch = computed(() => {
  if (props.config.hierarchyKeys.includes('level1')) {
    return form.level2.length > 0
  }
  const hasHierarchy = props.config.hierarchyKeys.some((key) => hasFormValue(key))
  const hasIdentifier = Boolean(props.config.identifier && form.identifier.trim())
  return hasHierarchy || hasIdentifier
})

const showClearButton = computed(() => canSearch.value || props.sessionActive)

const handleSearch = () =>
  emit('search', {
    ...form,
    level2: [...form.level2],
    level3: [...form.level3],
  })

const handleClear = () => {
  form.level1 = ''
  form.level2 = []
  form.level3 = []
  form.identifier = ''
  form.theme = ''
  level3Options.value = []
  if (props.config.hierarchyKeys.includes('level1')) {
    level2Options.value = []
  }
  emit('clear')
}

function applyIdentifierSelection(identifier: string): void {
  if (!props.config.identifier) {
    return
  }

  form.identifier = identifier.trim()
}

function clearIdentifierSelection(): void {
  if (!props.config.identifier) {
    return
  }

  form.identifier = ''
}

async function applyTerritorySelection(selection: TerritorySelection): Promise<void> {
  const level2Id = selection.level2Id?.trim() ?? ''
  const level3Id = selection.level3Id?.trim() ?? ''

  suppressHierarchyWatch.value = true
  try {
    if (!level2Id) {
      form.level2 = []
      form.level3 = []
      if (props.config.hierarchyKeys.includes('level3')) {
        level3Options.value = []
      }
      return
    }

    ensureOption('level2', level2Id, selection.level2Label)
    form.level2 = [level2Id]

    if (props.config.hierarchyKeys.includes('level3')) {
      await loadLevel3OptionsForParents([level2Id])
      if (level3Id) {
        ensureOption('level3', level3Id, selection.level3Label)
        form.level3 = [level3Id]
      } else {
        form.level3 = []
      }
    }
  } finally {
    suppressHierarchyWatch.value = false
  }
}

defineExpose({
  applyIdentifierSelection,
  clearIdentifierSelection,
  applyTerritorySelection,
  form,
})
</script>

<template>
  <section class="filter-container">
    <div class="filter-container-margin">
      <span class="title-checkRegistered">{{ config.title }}</span>

      <p v-if="loadingRoot" class="status-msg"><LoadingDotsComponent /></p>
      <p v-else-if="loadError" class="status-msg status-msg--error">{{ loadError }}</p>
      <p v-else-if="loadingChildren" class="status-msg"><LoadingDotsComponent /></p>

      <div class="filter-fields-container">
        <div
          v-for="field in visibleFields"
          :key="field.key"
          class="field-slot"
          :class="`field-slot--${field.key}`"
        >
          <MultiSelectInputComponent
            v-if="field.key === 'level2' || field.key === 'level3'"
            :id="field.key"
            v-model="form[field.key]"
            :label="field.label"
            :placeholder="field.placeholder"
            :items="optionsByLevel[field.key]"
            :disabled="isFieldDisabled(field.key) || loadingRoot"
          />
          <SelectInputComponent
            v-else
            :id="field.key"
            v-model="form[field.key]"
            :label="field.label"
            :placeholder="field.placeholder"
            :items="optionsByLevel[field.key]"
            :disabled="isFieldDisabled(field.key) || loadingRoot"
          />
        </div>

        <div v-if="config.identifier" class="field-slot field-slot--identifier">
          <TextInputComponent
            :id="config.identifier.key"
            v-model="form.identifier"
            :label="config.identifier.label"
            :placeholder="config.identifier.placeholder"
          >
          </TextInputComponent>
        </div>

        <div v-if="config.theme" class="field-slot field-slot--theme">
          <SelectInputComponent
            :id="config.theme.key"
            v-model="form.theme"
            :label="config.theme.label"
            :placeholder="config.theme.placeholder"
            :items="themeOptions"
            :disabled="loadingRoot"
          />
        </div>

        <div class="btns-container">
          <button
            type="button"
            class="br-button primary"
            :disabled="!canSearch || loadingRoot"
            @click="handleSearch"
          >
            <FontAwesomeIcon :icon="faSearch" class="mr-2" />
            Search
          </button>
          <button
            v-if="showClearButton"
            type="button"
            class="br-button inverted"
            @click="handleClear"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.filter-container {
  width: 100%;
  background: #f2f2f2;
  margin-bottom: 25px;
}

.filter-container-margin {
  margin-inline: min(26px, 3vw);
  padding-top: 16px;
  padding-bottom: 16px;
}

.title-checkRegistered {
  display: block;
  font-size: 20px;
  color: #333;
  font-weight: 400;
}

.status-msg {
  margin: 12px 0 0;
  font-size: 14px;
  color: #707070;
}

.status-msg--error {
  color: #b9382e;
}

.filter-fields-container {
  display: flex;
  flex-direction: row;
  gap: 24px;
  flex-wrap: wrap;
  padding-top: 22px;
  align-items: flex-end;
}

.field-slot--level2 {
  min-width: 220px;
  width: 30%;
  flex: 1 1 240px;
}

.field-slot--level3,
.field-slot--level1 {
  min-width: 220px;
  width: 30%;
  flex: 1 1 240px;
}

.field-slot--identifier,
.field-slot--theme {
  width: 25%;
  min-width: 240px;
  flex: 1 1 260px;
}

.btns-container {
  display: flex;
  justify-content: flex-start;
  align-items: flex-end;
  gap: 16px;
  min-width: 200px;
  padding-bottom: 2px;
}

@media screen and (max-width: 950px) {
  .field-slot--level2,
  .field-slot--level3,
  .field-slot--level1,
  .field-slot--identifier,
  .field-slot--theme {
    width: 100%;
    min-width: 100%;
    flex: 1 1 100%;
  }
}
</style>
