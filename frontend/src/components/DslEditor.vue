<script setup lang="ts">
import { computed } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { minimalSetup } from 'codemirror'
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'

const props = defineProps<{
  modelValue: string
  completionNames?: string[]
  validationStatus?: 'idle' | 'validating' | 'syntax-error' | 'warnings' | 'valid'
  readOnlyHeader?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Read latest names at completion call time (closure over reactive computed)
const currentNames = computed(() => props.completionNames ?? [])

function completionSource(context: CompletionContext): CompletionResult | null {
  const names = currentNames.value
  if (names.length === 0) return null

  const line = context.state.doc.lineAt(context.pos)
  const textToCursor = line.text.slice(0, context.pos - line.from)

  // After an arrow (sequence or flowchart): suggest target participant/node
  const afterArrow = textToCursor.match(/(?:->>|-->>|-x|--x|->|-->|=>>|==>)\s*(\w*)$/)
  if (afterArrow) {
    return {
      from: context.pos - (afterArrow[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

  // After "participant " keyword
  const afterParticipant = textToCursor.match(/^\s*participant\s+(\w*)$/)
  if (afterParticipant) {
    return {
      from: context.pos - (afterParticipant[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

  // At start of line (at least 1 char typed): suggest source participant/node
  // \w+ avoids triggering on empty lines
  const atStart = textToCursor.match(/^\s*(\w+)$/)
  if (atStart) {
    return {
      from: context.pos - (atStart[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

  return null
}

const extensions = [
  minimalSetup,
  autocompletion({ override: [completionSource], activateOnTyping: true }),
]
</script>

<template>
  <div :class="['dsl-editor', `status-${validationStatus ?? 'idle'}`]">
    <pre v-if="readOnlyHeader" class="dsl-header">{{ readOnlyHeader }}</pre>
    <Codemirror
      :model-value="modelValue"
      :extensions="extensions"
      :indent-with-tab="true"
      spellcheck="false"
      class="dsl-body"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.dsl-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--p-content-border-color);
}

/* Read-only header block */
.dsl-header {
  margin: 0;
  padding: 0.6rem 1rem;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--p-text-muted-color);
  background: var(--p-surface-100, #f4f4f5);
  border-bottom: 1px dashed var(--p-content-border-color);
  white-space: pre;
  overflow-x: auto;
  flex-shrink: 0;
  user-select: none;
}

/* CodeMirror body */
.dsl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dsl-editor :deep(.vue-codemirror) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dsl-editor :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  background: var(--p-surface-50, #fafafa);
}

.dsl-editor :deep(.cm-editor.cm-focused) {
  outline: none;
  background: var(--p-surface-0);
}

.dsl-editor :deep(.cm-scroller) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

.dsl-editor.status-syntax-error {
  border-left: 3px solid #dc2626;
}

.dsl-editor.status-warnings {
  border-left: 3px solid #d97706;
}

/* Autocomplete dropdown styling */
.dsl-editor :deep(.cm-tooltip-autocomplete) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.82rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.dsl-editor :deep(.cm-completionLabel) {
  font-size: 0.82rem;
}
</style>
