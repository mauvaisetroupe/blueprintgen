<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { allCategories, allNetworkZones, defaultAuthnConfig, type AuthGatewayInstance, type IamInstance, type AuthnConfig } from '@/types/dag'
import { generateAuthnDsl } from '@/utils/authnDslGenerator'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const route  = useRoute()
const store  = useDagStore()

const dagId  = computed(() => route.params.id as string)
const dag    = computed(() => store.getDag(dagId.value))
const authn  = computed(() => dag.value?.securityConfig?.authn)

// ── Local working copy — poussé vers le store à chaque changement ──
const cfg = ref<AuthnConfig>(defaultAuthnConfig())

onMounted(() => {
  if (!authn.value) return
  const raw = authn.value as any
  // Guard contre l'ancien format (authGateway singulier) qui aurait échappé à la migration du store
  if (!Array.isArray(raw.authGateways)) {
    cfg.value = defaultAuthnConfig()
    store.updateAuthnConfig(dagId.value, defaultAuthnConfig())
  } else {
    cfg.value = JSON.parse(JSON.stringify(authn.value))
  }
})

watch(cfg, (val) => {
  if (!dag.value) return
  store.updateAuthnConfig(dag.value.id, JSON.parse(JSON.stringify(val)))
}, { deep: true })

// ── Composants sélectionnables ──
const cats = computed(() => dag.value ? allCategories(dag.value) : [])

// Retourne { id, label } — si multi-instance, une entrée par instance (avec nom de zone)
function buildOptions(categoryNames: string[]): { id: string; label: string }[] {
  if (!dag.value) return []
  const catIds = cats.value
    .filter((c) => categoryNames.includes(c.name.toLowerCase()))
    .map((c) => c.id)
  const comps = dag.value.components.filter((c) => catIds.includes(c.categoryId))
  const instances  = dag.value.technicalLandscape.instances
  const zones      = allNetworkZones(dag.value.technicalLandscape)
  const zoneById   = new Map(zones.map((z) => [z.id, z]))

  const result: { id: string; label: string }[] = []
  for (const comp of comps) {
    const compInsts = instances.filter((i) => i.componentId === comp.id)
    if (compInsts.length > 1) {
      for (const inst of compInsts) {
        const zone = zoneById.get(inst.networkZoneId)
        result.push({ id: inst.id, label: `${comp.name} (${zone?.name ?? inst.networkZoneId})` })
      }
    } else {
      result.push({ id: comp.id, label: comp.name })
    }
  }
  return result
}

const userOptions      = computed(() => buildOptions(['users']))
const protectedOptions = computed(() => buildOptions(['frontends', 'backends']))

const dsl = computed(() => dag.value ? generateAuthnDsl({ ...dag.value, securityConfig: { authn: cfg.value } }) : '')

// ── Auth Gateways ──
function addGateway() {
  cfg.value.authGateways.push({
    id:                   crypto.randomUUID(),

    product:              '',
    userComponentIds:     [],
    protectedComponentIds:[],
    identityStoreIds:     [],
    roleManagementIds:    [],
  })
}

function removeGateway(id: string) {
  cfg.value.authGateways = cfg.value.authGateways.filter((gw) => gw.id !== id)
}

function toggleInList(list: string[], id: string) {
  const idx = list.indexOf(id)
  if (idx === -1) list.push(id)
  else list.splice(idx, 1)
}

// ── IAM helpers ──
function addIam(type: 'identityStores' | 'roleManagements' | 'permissionManagements') {
  cfg.value[type].push({ id: crypto.randomUUID(), product: '' })
}

function removeIam(type: 'identityStores' | 'roleManagements' | 'permissionManagements', id: string) {
  cfg.value[type] = (cfg.value[type] as IamInstance[]).filter((i) => i.id !== id)
  // Nettoie les références dans les gateways
  if (type === 'identityStores') {
    cfg.value.authGateways.forEach((gw) => { gw.identityStoreIds = gw.identityStoreIds.filter((x) => x !== id) })
  } else if (type === 'roleManagements') {
    cfg.value.authGateways.forEach((gw) => { gw.roleManagementIds = gw.roleManagementIds.filter((x) => x !== id) })
    cfg.value.roleToPermLinks = cfg.value.roleToPermLinks.filter((l) => l.fromRoleId !== id)
  } else {
    cfg.value.roleToPermLinks = cfg.value.roleToPermLinks.filter((l) => l.toPermId !== id)
  }
}

function toggleRoleToPermLink(fromRoleId: string, toPermId: string) {
  const idx = cfg.value.roleToPermLinks.findIndex((l) => l.fromRoleId === fromRoleId && l.toPermId === toPermId)
  if (idx === -1) cfg.value.roleToPermLinks.push({ fromRoleId, toPermId })
  else cfg.value.roleToPermLinks.splice(idx, 1)
}
</script>

<template>
  <div class="authn-view">

    <!-- Left panel -->
    <div class="authn-config">

      <!-- ── Auth Gateways ── -->
      <div class="section-group">
        <div class="group-header">
          <span class="group-title">Auth Gateways</span>
          <Button icon="pi pi-plus" size="small" text severity="secondary" label="Add" @click="addGateway" />
        </div>

        <div v-if="cfg.authGateways.length === 0" class="empty-hint">No gateway defined.</div>

        <div v-for="gw in cfg.authGateways" :key="gw.id" class="instance-card">
          <div class="card-header">
            <InputText v-model="gw.product" size="small" placeholder="e.g. Keycloak External" class="name-input" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeGateway(gw.id)" />
          </div>
          <div v-if="userOptions.length > 0" class="sub-section">
            <div class="sub-label">Authenticates</div>
            <div v-for="opt in userOptions" :key="opt.id" class="check-row">
              <input type="checkbox"
                     :id="`gw-${gw.id}-user-${opt.id}`"
                     :checked="gw.userComponentIds.includes(opt.id)"
                     @change="toggleInList(gw.userComponentIds, opt.id)" />
              <label :for="`gw-${gw.id}-user-${opt.id}`">{{ opt.label }}</label>
            </div>
          </div>

          <div v-if="protectedOptions.length > 0" class="sub-section">
            <div class="sub-label">Protects</div>
            <div v-for="opt in protectedOptions" :key="opt.id" class="check-row">
              <input type="checkbox"
                     :id="`gw-${gw.id}-prot-${opt.id}`"
                     :checked="gw.protectedComponentIds.includes(opt.id)"
                     @change="toggleInList(gw.protectedComponentIds, opt.id)" />
              <label :for="`gw-${gw.id}-prot-${opt.id}`">{{ opt.label }}</label>
            </div>
          </div>

          <div v-if="cfg.identityStores.length > 0" class="sub-section">
            <div class="sub-label">Uses identity store</div>
            <div v-for="s in cfg.identityStores" :key="s.id" class="check-row">
              <input type="checkbox"
                     :id="`gw-${gw.id}-ids-${s.id}`"
                     :checked="gw.identityStoreIds.includes(s.id)"
                     @change="toggleInList(gw.identityStoreIds, s.id)" />
              <label :for="`gw-${gw.id}-ids-${s.id}`">{{ s.product || '(unnamed)' }}</label>
            </div>
          </div>

          <div v-if="cfg.roleManagements.length > 0" class="sub-section">
            <div class="sub-label">Uses role management</div>
            <div v-for="r in cfg.roleManagements" :key="r.id" class="check-row">
              <input type="checkbox"
                     :id="`gw-${gw.id}-rm-${r.id}`"
                     :checked="gw.roleManagementIds.includes(r.id)"
                     @change="toggleInList(gw.roleManagementIds, r.id)" />
              <label :for="`gw-${gw.id}-rm-${r.id}`">{{ r.product || '(unnamed)' }}</label>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Identity Stores ── -->
      <div class="section-group">
        <div class="group-header">
          <span class="group-title">Identity Stores</span>
          <Button icon="pi pi-plus" size="small" text severity="secondary" label="Add" @click="addIam('identityStores')" />
        </div>
        <div v-for="s in cfg.identityStores" :key="s.id" class="instance-card compact">
          <div class="card-header">
            <InputText v-model="s.product" size="small" placeholder="e.g. LDAP, Active Directory" class="flex-1" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeIam('identityStores', s.id)" />
          </div>
        </div>
      </div>

      <!-- ── Role Management ── -->
      <div class="section-group">
        <div class="group-header">
          <span class="group-title">Role Management</span>
          <Button icon="pi pi-plus" size="small" text severity="secondary" label="Add" @click="addIam('roleManagements')" />
        </div>
        <div v-for="r in cfg.roleManagements" :key="r.id" class="instance-card compact">
          <div class="card-header">
            <InputText v-model="r.product" size="small" placeholder="e.g. OPA" class="flex-1" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeIam('roleManagements', r.id)" />
          </div>
          <div v-if="cfg.permissionManagements.length > 0" class="sub-section">
            <div class="sub-label">Uses permission management</div>
            <div v-for="p in cfg.permissionManagements" :key="p.id" class="check-row">
              <input type="checkbox"
                     :id="`rm-${r.id}-pm-${p.id}`"
                     :checked="cfg.roleToPermLinks.some((l) => l.fromRoleId === r.id && l.toPermId === p.id)"
                     @change="toggleRoleToPermLink(r.id, p.id)" />
              <label :for="`rm-${r.id}-pm-${p.id}`">{{ p.product || '(unnamed)' }}</label>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Permission Management ── -->
      <div class="section-group">
        <div class="group-header">
          <span class="group-title">Permission Management</span>
          <Button icon="pi pi-plus" size="small" text severity="secondary" label="Add" @click="addIam('permissionManagements')" />
        </div>
        <div v-for="p in cfg.permissionManagements" :key="p.id" class="instance-card compact">
          <div class="card-header">
            <InputText v-model="p.product" size="small" placeholder="e.g. Casbin" class="flex-1" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeIam('permissionManagements', p.id)" />
          </div>
        </div>
      </div>

    </div>

    <!-- Right panel: diagram -->
    <div class="authn-diagram">
      <div v-if="!dsl" class="empty-diagram">
        <i class="pi pi-lock" />
        <span>Add an Auth Gateway, select users and protected components to generate the diagram.</span>
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

.authn-config {
  width: 340px;
  min-width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  border-right: 1px solid var(--p-content-border-color);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.authn-diagram {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1rem;
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

.group-title {
  font-size: 0.85rem;
  font-weight: 600;
}

/* ── Instance cards ── */
.instance-card {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.instance-card:last-child { border-bottom: none; }

.card-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.name-input { flex: 1; }

.field-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.field-row label {
  width: 48px;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.flex-1 { flex: 1; }

/* ── Sub-sections (checkboxes) ── */
.sub-section {
  padding-top: 0.25rem;
}

.sub-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  margin-bottom: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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

/* ── Empty diagram state ── */
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
  max-width: 320px;
}

.empty-diagram i {
  font-size: 2rem;
  opacity: 0.35;
}
</style>
