<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import AuthenticationView from '@/views/dag/security/AuthenticationView.vue'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

type SubTab = 'authentication' | 'api-gateway' | 'waf' | 'files'
const activeSubTab = ref<SubTab>('authentication')
</script>

<template>
  <div v-if="dag" class="security">

    <!-- Sub-tabs -->
    <div class="sub-toolbar">
      <div class="sub-tabs">
        <button :class="['sub-tab', { active: activeSubTab === 'authentication' }]" @click="activeSubTab = 'authentication'">
          Authentication
        </button>
        <button :class="['sub-tab', { active: activeSubTab === 'api-gateway' }]" @click="activeSubTab = 'api-gateway'">
          API Gateway
        </button>
        <button :class="['sub-tab', { active: activeSubTab === 'waf' }]" @click="activeSubTab = 'waf'">
          WAF
        </button>
        <button :class="['sub-tab', { active: activeSubTab === 'files' }]" @click="activeSubTab = 'files'">
          Files
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="security-content">

      <AuthenticationView v-if="activeSubTab === 'authentication'" />

      <div v-else-if="activeSubTab === 'api-gateway'" class="coming-soon">
        <i class="pi pi-server" />
        <span>API Gateway — coming soon.</span>
      </div>

      <div v-else-if="activeSubTab === 'waf'" class="coming-soon">
        <i class="pi pi-shield" />
        <span>WAF (Web Application Firewall) — coming soon.</span>
      </div>

      <div v-else-if="activeSubTab === 'files'" class="coming-soon">
        <i class="pi pi-file" />
        <span>File Transfer &amp; Antivirus — coming soon.</span>
      </div>

    </div>

  </div>
</template>

<style scoped>
.security {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.sub-toolbar {
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
  background: var(--p-surface-0, #fff);
}

.sub-tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 1.1rem;
  height: 40px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.sub-tab:hover { color: var(--p-text-color); }

.sub-tab.active {
  color: var(--p-primary-color);
  border-bottom-color: var(--p-primary-color);
  font-weight: 600;
}

.security-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex: 1;
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.95rem;
}

.coming-soon i {
  font-size: 2rem;
  opacity: 0.35;
}
</style>
