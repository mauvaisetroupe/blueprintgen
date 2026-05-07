<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import { useHelp } from '@/composables/useHelp'

import frContent from '@/help/fr/yaml-syntax.md?raw'
import enContent from '@/help/en/yaml-syntax.md?raw'

const { lang } = useHelp()

const htmlContent = computed(() => marked.parse(lang.value === 'en' ? enContent : frContent) as string)
</script>

<template>
  <div class="yaml-syntax-page">
    <div class="yaml-syntax-body" v-html="htmlContent" />
  </div>
</template>

<style scoped>
.yaml-syntax-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem;
}

.yaml-syntax-body {
  line-height: 1.7;
  font-size: 0.925rem;
  color: var(--p-text-color);
}

:deep(h1) {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 0 1.5rem;
  padding-bottom: 0.6rem;
  border-bottom: 2px solid #42b883;
}

:deep(h2) {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 2rem 0 0.5rem;
  display: inline-block;
  border-bottom: 2px solid #42b883;
  padding-bottom: 0.15rem;
}

:deep(h3) {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 1.25rem 0 0.4rem;
  border-left: 3px solid rgba(66, 184, 131, 0.5);
  padding-left: 0.5rem;
  color: var(--p-text-muted-color);
}

:deep(p) { margin: 0.5rem 0; }

:deep(ul), :deep(ol) {
  margin: 0.4rem 0 0.4rem 1.5rem;
  padding: 0;
}

:deep(li) { margin: 0.25rem 0; }

:deep(pre) {
  background: var(--p-surface-100, #f3f4f6);
  border: 1px solid var(--p-surface-200, #e5e7eb);
  border-radius: 6px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}

:deep(pre code) {
  font-family: monospace;
  font-size: 0.82rem;
  background: transparent;
  padding: 0;
  line-height: 1.6;
}

:deep(code) {
  font-family: monospace;
  font-size: 0.85em;
  background: var(--p-surface-100, #f3f4f6);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}

:deep(strong) { font-weight: 600; }

:deep(hr) {
  border: none;
  border-top: 1px solid var(--p-surface-200, #e5e7eb);
  margin: 1.5rem 0;
}
</style>
