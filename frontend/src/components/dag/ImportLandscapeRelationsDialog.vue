<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDagStore } from '@/stores/dag'
import { allCategories } from '@/types/dag'
import { collectFlowRelations } from '@/utils/landscapeDslGenerator'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'

const props = defineProps<{ dagId: string; visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; imported: [] }>()

const store = useDagStore()
const dag = computed(() => store.getDag(props.dagId))

interface RelationChoice {
  key: string
  fromComponentId: string
  toComponentId: string
  fromComponentName: string
  toComponentName: string
  fromCategoryName: string
  toCategoryName: string
  alreadyExists: boolean
}

interface ChoiceGroup {
  groupKey: string
  label: string
  choices: RelationChoice[]
}

const choices = computed((): RelationChoice[] => {
  if (!dag.value) return []
  const cats = allCategories(dag.value)
  const allComps = dag.value.components

  return collectFlowRelations(dag.value).map((rel) => {
    const fromComp = allComps.find((c) => c.id === rel.fromComponentId)
    const toComp   = allComps.find((c) => c.id === rel.toComponentId)
    if (!fromComp || !toComp) return null

    const alreadyExists = dag.value!.relations.some(
      (r) => r.fromComponentId === rel.fromComponentId && r.toComponentId === rel.toComponentId,
    )

    return {
      key:               `${rel.fromComponentId}__${rel.toComponentId}`,
      fromComponentId:   rel.fromComponentId,
      toComponentId:     rel.toComponentId,
      fromComponentName: fromComp.name,
      toComponentName:   toComp.name,
      fromCategoryName:  cats.find((c) => c.id === fromComp.categoryId)?.name ?? '',
      toCategoryName:    cats.find((c) => c.id === toComp.categoryId)?.name   ?? '',
      alreadyExists,
    }
  }).filter((c): c is RelationChoice => c !== null)
})

const groupedChoices = computed((): ChoiceGroup[] => {
  const map = new Map<string, ChoiceGroup>()
  for (const c of choices.value) {
    const key = `${c.fromCategoryName}__${c.toCategoryName}`
    if (!map.has(key)) {
      map.set(key, { groupKey: key, label: `${c.fromCategoryName} → ${c.toCategoryName}`, choices: [] })
    }
    map.get(key)!.choices.push(c)
  }
  return [...map.values()]
})

const selected = ref<Set<string>>(new Set())

watch(() => props.visible, (v) => {
  if (v) selected.value = new Set(choices.value.filter((c) => !c.alreadyExists).map((c) => c.key))
})

const hasSelectable = computed(() => choices.value.some((c) => !c.alreadyExists))
const allSelected   = computed(() =>
  choices.value.filter((c) => !c.alreadyExists).every((c) => selected.value.has(c.key)),
)

function toggleSelectAll() {
  if (allSelected.value) {
    selected.value = new Set()
  } else {
    selected.value = new Set(choices.value.filter((c) => !c.alreadyExists).map((c) => c.key))
  }
}

function toggle(key: string, alreadyExists: boolean) {
  if (alreadyExists) return
  const s = new Set(selected.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  selected.value = s
}

function doImport() {
  if (!dag.value) return
  const toImport = choices.value.filter((c) => selected.value.has(c.key) && !c.alreadyExists)
  store.importLandscapeRelationsFromFlows(
    dag.value.id,
    toImport.map((c) => ({ fromComponentId: c.fromComponentId, toComponentId: c.toComponentId })),
  )
  emit('imported')
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Import relations from flows"
    :style="{ width: '560px', maxWidth: '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="choices.length === 0" class="empty-state">
      No flow relations found. Add application flows with sequence steps first.
    </div>

    <template v-else>
      <div class="dialog-toolbar">
        <span class="hint">Select relations derived from application flows to add to the landscape.</span>
        <Button
          :label="allSelected ? 'Deselect all' : 'Select all'"
          size="small"
          text
          :disabled="!hasSelectable"
          @click="toggleSelectAll"
        />
      </div>

      <table class="import-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>From</th>
            <th class="col-arrow"></th>
            <th>To</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="group in groupedChoices" :key="group.groupKey">
            <tr class="row-group-header">
              <td colspan="4">{{ group.label }}</td>
            </tr>
            <tr
              v-for="c in group.choices"
              :key="c.key"
              :class="{ 'row-exists': c.alreadyExists, 'row-selectable': !c.alreadyExists }"
              @click="toggle(c.key, c.alreadyExists)"
            >
              <td class="col-check">
                <Checkbox
                  :model-value="c.alreadyExists || selected.has(c.key)"
                  :disabled="c.alreadyExists"
                  binary
                  @click.stop
                  @update:model-value="toggle(c.key, c.alreadyExists)"
                />
              </td>
              <td class="cell-name">{{ c.fromComponentName }}</td>
              <td class="col-arrow">→</td>
              <td class="cell-name">{{ c.toComponentName }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </template>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="emit('update:visible', false)" />
      <Button
        label="Import"
        icon="pi pi-download"
        :disabled="selected.size === 0"
        @click="doImport"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.empty-state { color: var(--p-text-muted-color); font-style: italic; font-size: 0.875rem; padding: 0.5rem 0; }

.dialog-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 0.75rem; gap: 0.5rem;
}
.hint { font-size: 0.8rem; color: var(--p-text-muted-color); }

.import-table { width: 100%; border-collapse: collapse; }
.import-table thead th {
  text-align: left; font-size: 0.72rem; font-weight: 600; color: var(--p-text-muted-color);
  padding: 0.3rem 0.5rem; background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.import-table tbody tr { transition: background 0.1s; }
.row-group-header td {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--p-text-muted-color); padding: 0.5rem 0.5rem 0.2rem;
  background: var(--p-surface-50, #fafafa); border-bottom: 1px solid var(--p-content-border-color);
  border-top: 2px solid var(--p-content-border-color);
}
.row-group-header:first-child td { border-top: none; }
.import-table tbody tr.row-selectable { cursor: pointer; }
.import-table tbody tr.row-selectable:hover { background: var(--p-surface-50, #fafafa); }
.import-table tbody tr.row-exists { opacity: 0.45; }
.import-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--p-content-border-color); vertical-align: middle; }
.import-table tbody tr:last-child td { border-bottom: none; }

.col-check { width: 32px; }
.col-arrow  { width: 24px; text-align: center; color: var(--p-text-muted-color); font-size: 0.85rem; }
.cell-name  { font-size: 0.875rem; font-weight: 500; }
</style>
