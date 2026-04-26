<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { allCategories, allNetworkZones, defaultAuthnConfig, type AuthnConfig, type IamRole } from '@/types/dag'
import { generateAuthnDsl, buildSecurityNodeOptions } from '@/utils/authnDslGenerator'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Select from 'primevue/select'

const route = useRoute()
const store = useDagStore()

const dagId = computed(() => route.params.id as string)
const dag   = computed(() => store.getDag(dagId.value))
const authn = computed(() => dag.value?.securityConfig?.authn)

// ── Local working copy ──
const cfg = ref<AuthnConfig>(defaultAuthnConfig())

onMounted(() => {
  if (!authn.value) return
  const raw = authn.value as any
  if (!Array.isArray(raw.securityRelations)) {
    const fresh = defaultAuthnConfig()
    cfg.value = fresh
    store.updateAuthnConfig(dagId.value, fresh)
  } else {
    cfg.value = JSON.parse(JSON.stringify(authn.value))
  }
})

watch(cfg, (val) => {
  if (!dag.value) return
  store.updateAuthnConfig(dag.value.id, JSON.parse(JSON.stringify(val)))
}, { deep: true })

// ── Sub-tabs ──
type SubTab = 'components' | 'relations'
const activeTab = ref<SubTab>('components')

// ── DSL diagram ──
const dsl = computed(() =>
  dag.value ? generateAuthnDsl({ ...dag.value, securityConfig: { authn: cfg.value } }) : '',
)

// ── Node options (pour les checkboxes et les dropdowns Relations) ──
const nodeOptions = computed(() =>
  dag.value ? buildSecurityNodeOptions({ ...dag.value, securityConfig: { authn: cfg.value } }) : [],
)

function optionsByGroup(groups: string[]): { id: string; label: string }[] {
  return nodeOptions.value.filter((o) => groups.includes(o.group))
}

const userOptions      = computed(() => optionsByGroup(['Users']))
const protectedOptions = computed(() => optionsByGroup(['Frontends', 'Backends']))
const iamOptions       = computed(() => optionsByGroup(['IAM']))

// ── Helpers relations ──
function hasRelation(fromId: string, toId: string): boolean {
  return cfg.value.securityRelations.some((r) => r.fromId === fromId && r.toId === toId)
}
function toggleRelation(fromId: string, toId: string) {
  const idx = cfg.value.securityRelations.findIndex((r) => r.fromId === fromId && r.toId === toId)
  if (idx === -1) cfg.value.securityRelations.push({ id: crypto.randomUUID(), fromId, toId })
  else cfg.value.securityRelations.splice(idx, 1)
}
function removeRelation(id: string) {
  cfg.value.securityRelations = cfg.value.securityRelations.filter((r) => r.id !== id)
}

// ── Résolution label d'un nœud pour l'affichage dans le tab Relations ──
function nodeLabel(id: string): string {
  return nodeOptions.value.find((o) => o.id === id)?.label ?? id
}

// ── Ajout de relation (tab Relations) ──
const newFrom  = ref<string>('')
const newTo    = ref<string>('')
const newLabel = ref<string>('')

function addRelation() {
  if (!newFrom.value || !newTo.value) return
  cfg.value.securityRelations.push({
    id:    crypto.randomUUID(),
    fromId: newFrom.value,
    toId:   newTo.value,
    label:  newLabel.value || undefined,
  })
  newFrom.value  = ''
  newTo.value    = ''
  newLabel.value = ''
}

// ── Auth Gateways ──
function addGateway() {
  cfg.value.authGateways.push({ id: crypto.randomUUID(), product: '' })
}
function removeGateway(id: string) {
  cfg.value.authGateways = cfg.value.authGateways.filter((gw) => gw.id !== id)
  cfg.value.securityRelations = cfg.value.securityRelations.filter(
    (r) => r.fromId !== id && r.toId !== id,
  )
}

// ── IAM instances ──
function addIam() {
  cfg.value.iamInstances.push({ id: crypto.randomUUID(), product: '', roles: [] })
}
function removeIam(id: string) {
  cfg.value.iamInstances = cfg.value.iamInstances.filter((i) => i.id !== id)
  cfg.value.securityRelations = cfg.value.securityRelations.filter(
    (r) => r.fromId !== id && r.toId !== id,
  )
}
function toggleRole(iamId: string, role: IamRole) {
  const iam = cfg.value.iamInstances.find((i) => i.id === iamId)
  if (!iam) return
  const idx = iam.roles.indexOf(role)
  if (idx === -1) iam.roles.push(role)
  else iam.roles.splice(idx, 1)
}

const IAM_ROLES: { value: IamRole; label: string }[] = [
  { value: 'identityStore',        label: 'Identity Store' },
  { value: 'roleManagement',       label: 'Role Management' },
  { value: 'permissionManagement', label: 'Permission Management' },
]

// Options groupées pour les dropdowns From/To
const groupedNodeOptions = computed(() => {
  const groupOrder = ['Auth Gateway', 'IAM', 'Users', 'Frontends', 'Backends']
  const byGroup = new Map<string, { id: string; label: string }[]>()
  for (const opt of nodeOptions.value) {
    const list = byGroup.get(opt.group) ?? []
    list.push({ id: opt.id, label: opt.label })
    byGroup.set(opt.group, list)
  }
  return groupOrder
    .filter((g) => byGroup.has(g))
    .map((g) => ({ group: g, items: byGroup.get(g)! }))
})
</script>

<template>
  <div class="authn-view">

    <!-- ── Left panel ── -->
    <div class="authn-left">

      <!-- Sub-tabs -->
      <div class="sub-toolbar">
        <button :class="['sub-tab', { active: activeTab === 'components' }]" @click="activeTab = 'components'">
          Components
        </button>
        <button :class="['sub-tab', { active: activeTab === 'relations' }]" @click="activeTab = 'relations'">
          Relations
        </button>
      </div>

      <!-- ── Tab Components ── -->
      <div v-if="activeTab === 'components'" class="tab-body">

        <!-- Auth Gateways -->
        <div class="section-group">
          <div class="group-header">
            <span class="group-title">Auth Gateways</span>
            <Button icon="pi pi-plus" size="small" text severity="secondary" label="Add" @click="addGateway" />
          </div>
          <div v-if="cfg.authGateways.length === 0" class="empty-hint">No gateway defined.</div>
          <div v-for="gw in cfg.authGateways" :key="gw.id" class="instance-card">
            <div class="card-header">
              <InputText v-model="gw.product" size="small" placeholder="e.g. Keycloak External" class="flex-1" />
              <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeGateway(gw.id)" />
            </div>

            <div v-if="userOptions.length > 0" class="sub-section">
              <div class="sub-label">Authenticates</div>
              <div v-for="opt in userOptions" :key="opt.id" class="check-row">
                <input type="checkbox"
                       :id="`gw-${gw.id}-user-${opt.id}`"
                       :checked="hasRelation(opt.id, gw.id)"
                       @change="toggleRelation(opt.id, gw.id)" />
                <label :for="`gw-${gw.id}-user-${opt.id}`">{{ opt.label }}</label>
              </div>
            </div>

            <div v-if="iamOptions.length > 0" class="sub-section">
              <div class="sub-label">Uses IAM</div>
              <div v-for="opt in iamOptions" :key="opt.id" class="check-row">
                <input type="checkbox"
                       :id="`gw-${gw.id}-iam-${opt.id}`"
                       :checked="hasRelation(gw.id, opt.id)"
                       @change="toggleRelation(gw.id, opt.id)" />
                <label :for="`gw-${gw.id}-iam-${opt.id}`">{{ opt.label }}</label>
              </div>
            </div>

            <div v-if="protectedOptions.length > 0" class="sub-section">
              <div class="sub-label">Protects</div>
              <div v-for="opt in protectedOptions" :key="opt.id" class="check-row">
                <input type="checkbox"
                       :id="`gw-${gw.id}-prot-${opt.id}`"
                       :checked="hasRelation(gw.id, opt.id)"
                       @change="toggleRelation(gw.id, opt.id)" />
                <label :for="`gw-${gw.id}-prot-${opt.id}`">{{ opt.label }}</label>
              </div>
            </div>
          </div>
        </div>

        <!-- IAM Components -->
        <div class="section-group">
          <div class="group-header">
            <span class="group-title">IAM Components</span>
            <Button icon="pi pi-plus" size="small" text severity="secondary" label="Add" @click="addIam" />
          </div>
          <div v-if="cfg.iamInstances.length === 0" class="empty-hint">No IAM component defined.</div>
          <div v-for="iam in cfg.iamInstances" :key="iam.id" class="instance-card">
            <div class="card-header">
              <InputText v-model="iam.product" size="small" placeholder="e.g. Keycloak, LDAP, OPA" class="flex-1" />
              <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeIam(iam.id)" />
            </div>
            <div class="sub-section">
              <div class="sub-label">Roles</div>
              <div v-for="role in IAM_ROLES" :key="role.value" class="check-row">
                <input type="checkbox"
                       :id="`iam-${iam.id}-${role.value}`"
                       :checked="iam.roles.includes(role.value)"
                       @change="toggleRole(iam.id, role.value)" />
                <label :for="`iam-${iam.id}-${role.value}`">{{ role.label }}</label>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ── Tab Relations ── -->
      <div v-else class="tab-body">

        <!-- Add relation -->
        <div class="add-relation-block">
          <div class="add-relation-row">
            <Select
              v-model="newFrom"
              :options="groupedNodeOptions"
              option-label="label"
              option-value="id"
              option-group-label="group"
              option-group-children="items"
              placeholder="From"
              size="small"
              class="rel-select"
            />
            <span class="rel-arrow">→</span>
            <Select
              v-model="newTo"
              :options="groupedNodeOptions"
              option-label="label"
              option-value="id"
              option-group-label="group"
              option-group-children="items"
              placeholder="To"
              size="small"
              class="rel-select"
            />
          </div>
          <div class="add-relation-row">
            <InputText v-model="newLabel" size="small" placeholder="Label (optional)" class="flex-1" />
            <Button icon="pi pi-plus" size="small" label="Add" :disabled="!newFrom || !newTo" @click="addRelation" />
          </div>
        </div>

        <!-- Relations list -->
        <div v-if="cfg.securityRelations.length === 0" class="empty-hint" style="padding: 1rem">
          No relations defined.
        </div>
        <div v-for="rel in cfg.securityRelations" :key="rel.id" class="rel-row">
          <span class="rel-from">{{ nodeLabel(rel.fromId) }}</span>
          <span class="rel-sep">→</span>
          <span class="rel-to">{{ nodeLabel(rel.toId) }}</span>
          <span v-if="rel.label" class="rel-label">{{ rel.label }}</span>
          <Button icon="pi pi-trash" size="small" text severity="danger" class="rel-del" @click="removeRelation(rel.id)" />
        </div>

      </div>
    </div>

    <!-- ── Right panel: diagram ── -->
    <div class="authn-diagram">
      <div v-if="!dsl" class="empty-diagram">
        <i class="pi pi-lock" />
        <span>Add gateways and relations to generate the diagram.</span>
      </div>
      <MermaidDiagram v-else :code="dsl" />
    </div>

  </div>
</template>

<style scoped>
.authn-view {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── Left panel ── */
.authn-left {
  width: 340px;
  min-width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--p-content-border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sub-toolbar {
  display: flex;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
  background: var(--p-surface-0, #fff);
}

.sub-tab {
  flex: 1;
  padding: 0 1rem;
  height: 38px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--p-text-muted-color);
  transition: color 0.15s, border-color 0.15s;
}
.sub-tab:hover { color: var(--p-text-color); }
.sub-tab.active {
  color: var(--p-primary-color);
  border-bottom-color: var(--p-primary-color);
  font-weight: 600;
}

.tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* ── Sections ── */
.section-group {
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  overflow: hidden;
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  background: var(--p-surface-50, #f9fafb);
  border-bottom: 1px solid var(--p-content-border-color);
}
.group-title { font-size: 0.85rem; font-weight: 600; }

.instance-card {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.instance-card:last-child { border-bottom: none; }

.card-header { display: flex; align-items: center; gap: 0.4rem; }
.flex-1 { flex: 1; }

.sub-section { padding-top: 0.15rem; }
.sub-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.2rem;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  padding: 0.1rem 0;
}
.check-row label { cursor: pointer; }

.empty-hint {
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

/* ── Tab Relations ── */
.add-relation-block {
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.add-relation-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.rel-select { flex: 1; min-width: 0; }
.rel-arrow { color: var(--p-text-muted-color); flex-shrink: 0; }

.rel-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
  font-size: 0.8rem;
}
.rel-row:last-child { border-bottom: none; }
.rel-from { font-weight: 500; }
.rel-sep   { color: var(--p-text-muted-color); }
.rel-to    { flex: 1; }
.rel-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  background: var(--p-surface-100, #f3f4f6);
  padding: 0 0.3rem;
  border-radius: 3px;
}
.rel-del { margin-left: auto; flex-shrink: 0; }

/* ── Right panel ── */
.authn-diagram {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1rem;
}
.empty-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.875rem;
  text-align: center;
  max-width: 300px;
}
.empty-diagram i { font-size: 2rem; opacity: 0.35; }
</style>
