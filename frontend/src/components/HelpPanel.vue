<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import Drawer from 'primevue/drawer'
import { useHelp } from '@/composables/useHelp'

const { isOpen, lang, rawContent, setLang } = useHelp()

const htmlContent = computed(() => marked.parse(rawContent.value) as string)
</script>

<template>
  <Drawer v-model:visible="isOpen" position="right" :style="{ width: '420px' }">
    <template #header>
      <div class="help-header">
        <span class="help-title">Help</span>
        <div class="lang-toggle">
          <button :class="['lang-btn', { active: lang === 'fr' }]" @click="setLang('fr')">FR</button>
          <button :class="['lang-btn', { active: lang === 'en' }]" @click="setLang('en')">EN</button>
        </div>
      </div>
    </template>
    <div class="help-body" v-html="htmlContent" />
  </Drawer>
</template>

<style scoped>
.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.help-title {
  font-weight: 700;
  font-size: 1rem;
}

.lang-toggle {
  display: flex;
  gap: 2px;
  background: var(--p-surface-100, #f3f4f6);
  border-radius: 6px;
  padding: 2px;
}

.lang-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  color: var(--p-text-muted-color);
  transition: background 0.15s, color 0.15s;
}

.lang-btn.active {
  background: #42b883;
  color: #fff;
}

.lang-btn:not(.active):hover {
  background: var(--p-surface-200, #e5e7eb);
  color: var(--p-text-color);
}

.help-body {
  padding: 0.25rem 0.5rem;
  line-height: 1.6;
  font-size: 0.9rem;
  color: var(--p-text-color);
}

:deep(h1) {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--p-primary-color, #42b883);
}

:deep(h2) {
  font-size: 1rem;
  font-weight: 600;
  margin: 1.25rem 0 0.4rem;
  color: var(--p-text-color);
  display: inline-block;
  border-bottom: 2px solid #42b883;
  padding-bottom: 0.15rem;
}

:deep(h3) {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 1rem 0 0.3rem;
  color: var(--p-text-muted-color);
  border-left: 3px solid rgba(66, 184, 131, 0.5);
  padding-left: 0.5rem;
}

:deep(p) {
  margin: 0.4rem 0;
}

:deep(ul),
:deep(ol) {
  margin: 0.4rem 0 0.4rem 1.25rem;
  padding: 0;
}

:deep(li) {
  margin: 0.2rem 0;
}

:deep(code) {
  font-family: monospace;
  font-size: 0.85em;
  background: var(--p-surface-100, #f3f4f6);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}

:deep(strong) {
  font-weight: 600;
}

:deep(hr) {
  border: none;
  border-top: 1px solid var(--p-surface-200, #e5e7eb);
  margin: 1rem 0;
}
</style>
