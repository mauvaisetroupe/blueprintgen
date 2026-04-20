<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { minimalSetup } from 'codemirror'
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import readOnlyRanges from 'codemirror-readonly-ranges'

const props = defineProps<{
  modelValue: string
  completionNames?: string[]
  validationStatus?: 'idle' | 'validating' | 'syntax-error' | 'warnings' | 'valid'
  readOnlyHeader?: string
  readOnlyFooter?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ── Document helpers ───────────────────────────────────────────────────────────

function buildFullDoc(header: string, body: string, footer: string): string {
  const parts: string[] = []
  if (header) parts.push(header)
  parts.push(body)
  if (footer) parts.push(footer)
  return parts.join('\n')
}

function calcHeaderLen(header: string) { return header ? header.length + 1 : 0 }
function calcFooterLen(footer: string) { return footer ? footer.length + 1 : 0 }

function extractBody(fullDoc: string, headerLen: number, footerLen: number): string {
  return fullDoc.slice(headerLen, footerLen > 0 ? fullDoc.length - footerLen : undefined)
}

// ── Boundary state field ───────────────────────────────────────────────────────
// Stores header/footer lengths so both the readonly extension and the decoration
// can access them from the EditorState without closing over external variables.

const setBoundaries = StateEffect.define<{ headerLen: number; footerLen: number }>()

const boundariesField = StateField.define<{ headerLen: number; footerLen: number }>({
  create: () => ({ headerLen: 0, footerLen: 0 }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBoundaries)) return effect.value
    }
    return value
  },
})

// ── Read-only ranges extension ─────────────────────────────────────────────────

const readonlyRangesExt = readOnlyRanges((state: EditorState) => {
  const { headerLen, footerLen } = state.field(boundariesField)
  const docLen = state.doc.length
  const ranges: Array<{ from: number | undefined; to: number | undefined }> = []
  if (headerLen > 0) ranges.push({ from: 0, to: headerLen })
  if (footerLen > 0) ranges.push({ from: docLen - footerLen, to: docLen })
  return ranges
})

// ── Grey decoration for read-only zones ───────────────────────────────────────

const readonlyPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildDecorations(view) }
    update(u: ViewUpdate) {
      const hadEffect = u.transactions.some((tr) => tr.effects.some((e) => e.is(setBoundaries)))
      if (u.docChanged || hadEffect) this.decorations = buildDecorations(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

function buildDecorations(view: EditorView): DecorationSet {
  const { headerLen, footerLen } = view.state.field(boundariesField)
  const docLen = view.state.doc.length
  const builder = new RangeSetBuilder<Decoration>()
  const mark = Decoration.mark({ class: 'cm-readonly-zone' })
  // Header text (exclude trailing '\n' separator)
  if (headerLen > 1) builder.add(0, Math.min(headerLen - 1, docLen), mark)
  // Footer text (exclude leading '\n' separator)
  if (footerLen > 1 && docLen > footerLen) builder.add(docLen - footerLen + 1, docLen, mark)
  return builder.finish()
}

// ── Autocomplete ───────────────────────────────────────────────────────────────

const currentNames = computed(() => props.completionNames ?? [])

function completionSource(context: CompletionContext): CompletionResult | null {
  const names = currentNames.value
  if (names.length === 0) return null

  const line = context.state.doc.lineAt(context.pos)
  const textToCursor = line.text.slice(0, context.pos - line.from)

  const afterArrow = textToCursor.match(/(?:->>|-->>|-x|--x|->|-->|=>>|==>)\s*(\w*)$/)
  if (afterArrow) {
    return {
      from: context.pos - (afterArrow[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

  const afterParticipant = textToCursor.match(/^\s*participant\s+(\w*)$/)
  if (afterParticipant) {
    return {
      from: context.pos - (afterParticipant[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

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
  boundariesField,
  readonlyRangesExt,
  readonlyPlugin,
  autocompletion({ override: [completionSource], activateOnTyping: true }),
]

// ── View reference & initial document ─────────────────────────────────────────
// initialDoc is set once and never updated — vue-codemirror uses it only to
// seed the editor on mount.  All subsequent doc changes go through view.dispatch
// so the cursor position is preserved.

let cmView: EditorView | null = null

const initialDoc = ref(
  buildFullDoc(props.readOnlyHeader ?? '', props.modelValue, props.readOnlyFooter ?? ''),
)

function onReady({ view }: { view: EditorView }) {
  cmView = view
  const hLen = calcHeaderLen(props.readOnlyHeader ?? '')
  const fLen = calcFooterLen(props.readOnlyFooter ?? '')
  view.dispatch({ effects: setBoundaries.of({ headerLen: hLen, footerLen: fLen }) })
}

// ── Emit only the editable body ────────────────────────────────────────────────

function onDocChange(fullDocValue: string) {
  if (!cmView) return
  const { headerLen, footerLen } = cmView.state.field(boundariesField)
  const body = extractBody(fullDocValue, headerLen, footerLen)
  if (body !== props.modelValue) emit('update:modelValue', body)
}

// ── Prop watchers → view.dispatch ─────────────────────────────────────────────

// Body updated externally (parent debounce sync)
watch(() => props.modelValue, (newBody) => {
  if (!cmView) return
  const { headerLen, footerLen } = cmView.state.field(boundariesField)
  const docLen = cmView.state.doc.length
  const currentBody = extractBody(cmView.state.doc.toString(), headerLen, footerLen)
  if (currentBody === newBody) return  // already in sync, avoid loop

  const bodyEnd = footerLen > 0 ? docLen - footerLen : docLen
  cmView.dispatch({ changes: { from: headerLen, to: bodyEnd, insert: newBody } })
})

// Header or footer changed (component renamed, subgraph toggled…)
watch([() => props.readOnlyHeader, () => props.readOnlyFooter], ([newHeader, newFooter]) => {
  if (!cmView) return
  const header = newHeader ?? ''
  const footer = newFooter ?? ''
  const hLen = calcHeaderLen(header)
  const fLen = calcFooterLen(footer)
  const { headerLen, footerLen } = cmView.state.field(boundariesField)
  const currentBody = extractBody(cmView.state.doc.toString(), headerLen, footerLen)
  const newDoc = buildFullDoc(header, currentBody, footer)

  cmView.dispatch({
    changes: { from: 0, to: cmView.state.doc.length, insert: newDoc },
    effects: setBoundaries.of({ headerLen: hLen, footerLen: fLen }),
  })
})
</script>

<template>
  <div :class="['dsl-editor', `status-${validationStatus ?? 'idle'}`]">
    <Codemirror
      :model-value="initialDoc"
      :extensions="extensions"
      :indent-with-tab="true"
      spellcheck="false"
      class="dsl-body"
      @ready="onReady"
      @update:model-value="onDocChange"
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

/* Read-only zones (header / footer) — grey text */
.dsl-editor :deep(.cm-readonly-zone) {
  color:  #a8968e;
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
