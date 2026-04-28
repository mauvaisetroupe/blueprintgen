<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDagStore } from '@/stores/dag'
import { allNetworkZones, DEFAULT_ZONE_COLORS } from '@/types/dag'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'

const props = defineProps<{ dagId: string; visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const store = useDagStore()
const dag = computed(() => store.getDag(props.dagId))
const tl  = computed(() => dag.value?.technicalLandscape)

// ── Types internes ──────────────────────────────────────────────────────────

interface RelationChoice {
  key: string
  fromComponentId: string
  toComponentId: string
  fromComponentName: string
  toComponentName: string
  fromInstanceId: string
  toInstanceId: string
  fromZoneName: string
  toZoneName: string
  protocol?: string
  label?: string
  alreadyExists: boolean
}

// ── Données ─────────────────────────────────────────────────────────────────

const zones = computed(() => tl.value ? allNetworkZones(tl.value) : [])

function zoneColors(name: string) {
  return DEFAULT_ZONE_COLORS.get(name.toLowerCase()) ?? { fill: '#f3f4f6', stroke: '#d1d5db' }
}

const choices = computed((): RelationChoice[] => {
  if (!dag.value || !tl.value) return []
  const result: RelationChoice[] = []
  const allComps = [...dag.value.components, ...(dag.value.technicalComponents ?? [])]

  for (const rel of dag.value.relations) {
    const fromComp = allComps.find((c) => c.id === rel.fromComponentId)
    const toComp   = allComps.find((c) => c.id === rel.toComponentId)
    if (!fromComp || !toComp) continue

    const fromInstances = tl.value.instances.filter((i) => i.componentId === rel.fromComponentId)
    const toInstances   = tl.value.instances.filter((i) => i.componentId === rel.toComponentId)
    if (fromInstances.length === 0 || toInstances.length === 0) continue

    for (const fromInst of fromInstances) {
      for (const toInst of toInstances) {
        const fromZone = zones.value.find((z) => z.id === fromInst.networkZoneId)
        const toZone   = zones.value.find((z) => z.id === toInst.networkZoneId)
        const alreadyExists = tl.value.technicalRelations.some(
          (tr) => tr.fromInstanceId === fromInst.id && tr.toInstanceId === toInst.id,
        )
        result.push({
          key:               `${fromInst.id}__${toInst.id}`,
          fromComponentId:   rel.fromComponentId,
          toComponentId:     rel.toComponentId,
          fromComponentName: fromComp.name,
          toComponentName:   toComp.name,
          fromInstanceId:    fromInst.id,
          toInstanceId:      toInst.id,
          fromZoneName:      fromZone?.name ?? '',
          toZoneName:        toZone?.name   ?? '',
          protocol:          rel.protocol,
          label:             rel.label,
          alreadyExists,
        })
      }
    }
  }
  return result
})

const selected = ref<Set<string>>(new Set())

watch(() => props.visible, (v) => {
  if (v) selected.value = new Set(choices.value.filter((c) => !c.alreadyExists).map((c) => c.key))
})

const hasSelectable = computed(() => choices.value.some((c) => !c.alreadyExists))
const allSelected   = computed(() => choices.value.filter((c) => !c.alreadyExists).every((c) => selected.value.has(c.key)))

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
  store.importTechnicalRelationsFromLandscape(
    dag.value.id,
    toImport.map((c) => ({
      fromComponentId: c.fromComponentId,
      toComponentId:   c.toComponentId,
      fromInstanceId:  c.fromInstanceId,
      toInstanceId:    c.toInstanceId,
      protocol:        c.protocol,
      label:           c.label,
    })),
  )
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Import relations from landscape"
    :style="{ width: '680px', maxWidth: '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="choices.length === 0" class="empty-state">
      No landscape relations can be imported. Make sure components are assigned to network zones first.
    </div>

    <template v-else>
      <div class="dialog-toolbar">
        <span class="hint">Select relations to import as technical relations.</span>
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
            <th class="col-zone"></th>
            <th class="col-arrow"></th>
            <th>To</th>
            <th class="col-zone"></th>
            <th class="col-proto">Protocol</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in choices"
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
            <td class="col-zone">
              <span
                v-if="c.fromZoneName"
                class="zone-pill"
                :style="{ background: zoneColors(c.fromZoneName).fill, borderColor: zoneColors(c.fromZoneName).stroke }"
              >{{ c.fromZoneName }}</span>
            </td>
            <td class="col-arrow">→</td>
            <td class="cell-name">{{ c.toComponentName }}</td>
            <td class="col-zone">
              <span
                v-if="c.toZoneName"
                class="zone-pill"
                :style="{ background: zoneColors(c.toZoneName).fill, borderColor: zoneColors(c.toZoneName).stroke }"
              >{{ c.toZoneName }}</span>
            </td>
            <td class="col-proto">
              <span v-if="c.protocol" class="proto-badge">{{ c.protocol }}</span>
            </td>
          </tr>
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
  margin-bottom: 0.75rem;
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
.import-table tbody tr.row-selectable { cursor: pointer; }
.import-table tbody tr.row-selectable:hover { background: var(--p-surface-50, #fafafa); }
.import-table tbody tr.row-exists { opacity: 0.45; }
.import-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--p-content-border-color); vertical-align: middle; }
.import-table tbody tr:last-child td { border-bottom: none; }

.col-check  { width: 32px; }
.col-zone   { width: 1%; white-space: nowrap; }
.col-arrow  { width: 24px; text-align: center; color: var(--p-text-muted-color); font-size: 0.85rem; }
.col-proto  { width: 90px; }
.cell-name  { font-size: 0.875rem; font-weight: 500; }

.zone-pill {
  display: inline-block;
  font-size: 0.72rem; padding: 0.12rem 0.45rem; border-radius: 20px;
  border: 1px solid; white-space: nowrap; color: #064e3b;
}
.proto-badge {
  display: inline-block;
  font-size: 0.72rem; padding: 0.12rem 0.4rem; border-radius: 4px;
  background: var(--p-surface-100, #f3f4f6); color: var(--p-text-muted-color);
  border: 1px solid var(--p-content-border-color);
}
</style>
