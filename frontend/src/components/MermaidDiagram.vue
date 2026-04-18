<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import mermaid from 'mermaid'

const props = defineProps<{
  code: string
}>()

const container = ref<HTMLElement>()
const error = ref<string | null>(null)

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

async function render() {
  if (!container.value || !props.code.trim()) return
  error.value = null
  try {
    const id = `mermaid-${Date.now()}`
    const { svg } = await mermaid.render(id, props.code)
    container.value.innerHTML = svg
  } catch (e) {
    // Extract the useful part of Mermaid error messages (strip "Syntax error in text\nmermaid version x.x.x")
    const raw = e instanceof Error ? e.message : 'Invalid diagram syntax'
    const cleaned = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim()
    error.value = cleaned || 'Invalid diagram syntax'
    container.value.innerHTML = ''
  }
}

onMounted(render)
watch(() => props.code, render)
</script>

<template>
  <div class="mermaid-wrapper">
    <div ref="container" class="mermaid-container" />
    <div v-if="error" class="mermaid-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.mermaid-wrapper {
  width: 100%;
  height: 100%;
}

.mermaid-container {
  width: 100%;
  overflow: auto;
}

.mermaid-error {
  color: #c00;
  font-size: 0.875rem;
  padding: 0.5rem;
  background: #fff0f0;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
