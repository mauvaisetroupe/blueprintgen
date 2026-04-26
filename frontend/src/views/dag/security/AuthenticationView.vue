<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { allCategories } from '@/types/dag'
import { generateAuthnDsl } from '@/utils/authnDslGenerator'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import ToggleSwitch from 'primevue/toggleswitch'
import InputText from 'primevue/inputtext'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

const authn = computed(() => dag.value?.securityConfig?.authn)

const cats = computed(() => dag.value ? allCategories(dag.value) : [])

// Components selectable as Users (category name = 'Users')
const userComponents = computed(() => {
  if (!dag.value) return []
  const userCatIds = cats.value
    .filter((c) => c.name.toLowerCase() === 'users')
    .map((c) => c.id)
  return dag.value.components.filter((c) => userCatIds.includes(c.categoryId))
})

// Components selectable as protected (Frontends + Backends)
const protectedComponents = computed(() => {
  if (!dag.value) return []
  const catIds = cats.value
    .filter((c) => ['frontends', 'backends'].includes(c.name.toLowerCase()))
    .map((c) => c.id)
  return dag.value.components.filter((c) => catIds.includes(c.categoryId))
})

const dsl = computed(() => dag.value ? generateAuthnDsl(dag.value) : '')

function patch(updates: Record<string, unknown>) {
  if (!dag.value) return
  store.updateAuthnConfig(dag.value.id, updates as never)
}

function patchComponent(field: 'authGateway' | 'identityStore' | 'roleManagement' | 'permissionManagement', key: 'enabled' | 'product', value: boolean | string) {
  if (!authn.value) return
  patch({ [field]: { ...authn.value[field], [key]: value } })
}

function toggleUserId(id: string) {
  if (!authn.value) return
  const ids = authn.value.userComponentIds.includes(id)
    ? authn.value.userComponentIds.filter((x) => x !== id)
    : [...authn.value.userComponentIds, id]
  patch({ userComponentIds: ids })
}

function toggleProtectedId(id: string) {
  if (!authn.value) return
  const ids = authn.value.protectedComponentIds.includes(id)
    ? authn.value.protectedComponentIds.filter((x) => x !== id)
    : [...authn.value.protectedComponentIds, id]
  patch({ protectedComponentIds: ids })
}
</script>

<template>
  <div v-if="authn" class="authn-view">

    <!-- Left panel: configuration -->
    <div class="authn-config">

      <!-- Auth Gateway -->
      <section class="config-section">
        <div class="section-header">
          <ToggleSwitch
            :model-value="authn.authGateway.enabled"
            size="small"
            @update:model-value="patchComponent('authGateway', 'enabled', $event)"
          />
          <span class="section-title">Auth Gateway</span>
        </div>
        <div v-if="authn.authGateway.enabled" class="section-body">
          <InputText
            :model-value="authn.authGateway.product ?? ''"
            size="small"
            placeholder="Product name (e.g. Keycloak)"
            class="product-input"
            @update:model-value="patchComponent('authGateway', 'product', $event)"
          />
        </div>
      </section>

      <!-- Identity Store -->
      <section class="config-section">
        <div class="section-header">
          <ToggleSwitch
            :model-value="authn.identityStore.enabled"
            size="small"
            @update:model-value="patchComponent('identityStore', 'enabled', $event)"
          />
          <span class="section-title">Identity Store</span>
        </div>
        <div v-if="authn.identityStore.enabled" class="section-body">
          <InputText
            :model-value="authn.identityStore.product ?? ''"
            size="small"
            placeholder="Product name (e.g. LDAP, Active Directory)"
            class="product-input"
            @update:model-value="patchComponent('identityStore', 'product', $event)"
          />
        </div>
      </section>

      <!-- Role Management -->
      <section class="config-section">
        <div class="section-header">
          <ToggleSwitch
            :model-value="authn.roleManagement.enabled"
            size="small"
            @update:model-value="patchComponent('roleManagement', 'enabled', $event)"
          />
          <span class="section-title">Role Management</span>
        </div>
        <div v-if="authn.roleManagement.enabled" class="section-body">
          <InputText
            :model-value="authn.roleManagement.product ?? ''"
            size="small"
            placeholder="Product name (e.g. OPA)"
            class="product-input"
            @update:model-value="patchComponent('roleManagement', 'product', $event)"
          />
        </div>
      </section>

      <!-- Permission Management -->
      <section class="config-section">
        <div class="section-header">
          <ToggleSwitch
            :model-value="authn.permissionManagement.enabled"
            size="small"
            @update:model-value="patchComponent('permissionManagement', 'enabled', $event)"
          />
          <span class="section-title">Permission Management</span>
        </div>
        <div v-if="authn.permissionManagement.enabled" class="section-body">
          <InputText
            :model-value="authn.permissionManagement.product ?? ''"
            size="small"
            placeholder="Product name"
            class="product-input"
            @update:model-value="patchComponent('permissionManagement', 'product', $event)"
          />
        </div>
      </section>

      <hr class="divider" />

      <!-- User components -->
      <section class="config-section">
        <div class="section-title comp-group-title">User components</div>
        <div v-if="userComponents.length === 0" class="empty-hint">
          No components in the "Users" category.
        </div>
        <div v-for="c in userComponents" :key="c.id" class="comp-row">
          <input
            type="checkbox"
            :id="`user-${c.id}`"
            :checked="authn.userComponentIds.includes(c.id)"
            @change="toggleUserId(c.id)"
          />
          <label :for="`user-${c.id}`">{{ c.name }}</label>
        </div>
      </section>

      <!-- Protected components -->
      <section class="config-section">
        <div class="section-title comp-group-title">Protected components</div>
        <div v-if="protectedComponents.length === 0" class="empty-hint">
          No components in "Frontends" or "Backends" categories.
        </div>
        <div v-for="c in protectedComponents" :key="c.id" class="comp-row">
          <input
            type="checkbox"
            :id="`prot-${c.id}`"
            :checked="authn.protectedComponentIds.includes(c.id)"
            @change="toggleProtectedId(c.id)"
          />
          <label :for="`prot-${c.id}`">{{ c.name }}</label>
        </div>
      </section>

    </div>

    <!-- Right panel: diagram -->
    <div class="authn-diagram">
      <div v-if="!dsl" class="empty-diagram">
        <i class="pi pi-lock" />
        <span>Configure authentication components and select at least one user and one protected component to generate the diagram.</span>
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
  width: 320px;
  min-width: 260px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  border-right: 1px solid var(--p-content-border-color);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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

.config-section {
  padding: 0.5rem 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
}

.comp-group-title {
  margin-bottom: 0.4rem;
}

.section-body {
  margin-top: 0.5rem;
  padding-left: 2.2rem;
}

.product-input {
  width: 100%;
}

.divider {
  border: none;
  border-top: 1px solid var(--p-content-border-color);
  margin: 0.5rem 0;
}

.comp-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.875rem;
}

.comp-row label {
  cursor: pointer;
}

.empty-hint {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.25rem 0;
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
  max-width: 320px;
}

.empty-diagram i {
  font-size: 2rem;
  opacity: 0.35;
}
</style>
