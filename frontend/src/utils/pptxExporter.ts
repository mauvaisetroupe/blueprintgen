import PptxGenJS from 'pptxgenjs'
import mermaid from 'mermaid'
import type { Dag } from '@/types/dag'
import { generateLandscapeDsl } from './landscapeDslGenerator'
import { buildSequenceDsl, collectAllFlowRelations } from './sequenceDslGenerator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from './svgInliner'

// Widescreen 13.33" × 7.5"
const SLIDE_W = 13.33
const SLIDE_H = 7.5

// Corporate colours (neutral — adapt to template later)
const COLOR_TITLE_BG  = '1F3864'   // dark blue
const COLOR_TITLE_FG  = 'FFFFFF'
const COLOR_ACCENT    = 'F5C400'   // yellow for step bullets

// ─── Mermaid → PNG via canvas ────────────────────────────────────────────────
//
// Strategy: SVG → canvas → PNG data URL.
// Why canvas instead of embedding SVG directly in PowerPoint:
//   • PowerPoint's SVG renderer ignores <style> blocks → CSS variables unresolved
//     → black cluster backgrounds, missing colours.
//   • Even with inlined styles, PowerPoint's renderer drops some SVG features
//     (e.g. some path/marker combinations used by Mermaid for arrows).
//   • Canvas rasterises exactly what the browser sees → pixel-perfect in PPT.
//
// Why htmlLabels: false is required:
//   • Mermaid flowcharts use <foreignObject> for node labels by default.
//   • Drawing an SVG containing <foreignObject> to a canvas taints it
//     (security restriction) → toDataURL() throws SecurityError.
//   • htmlLabels: false makes Mermaid use SVG <text> elements instead.
//   • Sequence diagrams already use <text> natively → unaffected.
//
// Resolution: 2× for crisp rendering on high-DPI screens.

const PNG_SCALE = 2

// Mermaid SVGs often have width/height as percentages or rely on max-width CSS,
// making img.naturalWidth unreliable (returns a small default like 0 or 100).
// This causes the canvas to be too small and only the top-left corner is drawn.
// Fix: read the viewBox and stamp explicit pixel width/height onto the SVG element.
function normalizeSvgDimensions(svgString: string): string {
  const div = document.createElement('div')
  div.innerHTML = svgString
  const svg = div.querySelector('svg')
  if (!svg) return svgString

  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      svg.setAttribute('width',  String(parts[2]))
      svg.setAttribute('height', String(parts[3]))
      svg.style.maxWidth = ''   // remove any interfering CSS max-width
    }
  }
  return svg.outerHTML
}

function svgToPngDataUrl(svgString: string): Promise<string> {
  const normalized = normalizeSvgDimensions(svgString)
  return new Promise((resolve, reject) => {
    const b64 = btoa(unescape(encodeURIComponent(normalized)))
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth  || 1200
      const h = img.naturalHeight || 700
      const canvas = document.createElement('canvas')
      canvas.width  = w * PNG_SCALE
      canvas.height = h * PNG_SCALE
      const ctx = canvas.getContext('2d')!
      ctx.scale(PNG_SCALE, PNG_SCALE)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch (e) {
        reject(new Error(`Canvas tainted — SVG may contain cross-origin resources: ${e}`))
      }
    }
    img.onerror = (e) => reject(new Error(`Failed to load SVG into Image element: ${e}`))
    img.src = `data:image/svg+xml;base64,${b64}`
  })
}

async function renderMermaidToPng(dsl: string): Promise<string> {
  const id = `pptx-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // injectHtmlLabelsFalse: avoids <foreignObject> → canvas stays untainted
  // inlineSvgStyles: resolves CSS var() on cluster shapes → correct colours
  const { svg } = await mermaid.render(id, injectHtmlLabelsFalse(dsl))
  return svgToPngDataUrl(inlineSvgStyles(svg))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Extracts forward-arrow steps from a sequence body DSL
// Returns strings like "A → B: label"
function extractFlowSteps(body: string): string[] {
  const REQUEST_ARROW = /^([a-zA-Z_]\w*)\s*(->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/
  const steps: string[] = []
  for (const raw of body.split('\n')) {
    const m = raw.trim().match(REQUEST_ARROW)
    if (m) steps.push(`${m[1]} → ${m[3]}: ${m[4].trim()}`)
  }
  return steps
}

// ─── Slide builders ───────────────────────────────────────────────────────────

function addTitleBar(slide: PptxGenJS.Slide, title: string) {
  slide.addShape('rect', {
    x: 0, y: 0, w: SLIDE_W, h: 0.55,
    fill: { color: COLOR_TITLE_BG },
    line: { color: COLOR_TITLE_BG },
  })
  slide.addText(title, {
    x: 0.3, y: 0, w: SLIDE_W - 0.6, h: 0.55,
    fontSize: 18, bold: true,
    color: COLOR_TITLE_FG,
    valign: 'middle',
  })
}

function resolveLandscapeDsl(dag: Dag): string {
  const mode   = dag.landscape.mode   ?? 'guided'
  const useElk = dag.landscape.useElk ?? false

  if (mode === 'manual' && dag.landscape.mermaidDsl?.trim()) {
    // Stored DSL may be body-only or full DSL — ensure it has a header
    const stored = dag.landscape.mermaidDsl.trim()
    if (stored.startsWith('---') || /^(?:flowchart|graph)\s/m.test(stored)) {
      return stored
    }
    return `---\nconfig:\n    theme: neutral\n---\n\nflowchart TB\n${stored}`
  }

  if (mode === 'autosync') {
    return generateLandscapeDsl(dag, { useElk }, collectAllFlowRelations(dag))
  }

  // guided (default)
  return generateLandscapeDsl(dag, { useElk })
}

async function addLandscapeSlide(pptx: PptxGenJS, dag: Dag) {
  const slide = pptx.addSlide()
  addTitleBar(slide, dag.name + ' — Application Landscape')

  const dsl = resolveLandscapeDsl(dag)
  const png = await renderMermaidToPng(dsl)

  // Image fills the area below the title bar
  const imgY = 0.6
  const imgH = SLIDE_H - imgY - 0.1
  slide.addImage({ data: png, x: 0.2, y: imgY, w: SLIDE_W - 0.4, h: imgH, sizing: { type: 'contain', w: SLIDE_W - 0.4, h: imgH } })
}

async function addFlowSlide(pptx: PptxGenJS, dag: Dag, flowName: string, flowBody: string) {
  const slide = pptx.addSlide()
  addTitleBar(slide, flowName)

  const fullDsl = buildSequenceDsl(flowBody, dag)
  const png = await renderMermaidToPng(fullDsl)

  const contentY = 0.65
  const contentH = SLIDE_H - contentY - 0.1
  const imgW     = SLIDE_W * 0.63
  const bulletsX = imgW + 0.4
  const bulletsW = SLIDE_W - bulletsX - 0.2

  // Sequence diagram — left panel
  slide.addImage({
    data: png,
    x: 0.15, y: contentY, w: imgW, h: contentH,
    sizing: { type: 'contain', w: imgW, h: contentH },
  })

  // Numbered steps — right panel
  const steps = extractFlowSteps(flowBody)
  if (steps.length > 0) {
    const bulletRows: PptxGenJS.TextProps[] = steps.flatMap((step, i) => [
      {
        text: `${i + 1}. `,
        options: { bold: true, color: COLOR_ACCENT, fontSize: 11 },
      },
      {
        text: step + '\n',
        options: { bold: false, color: '333333', fontSize: 11 },
      },
    ])
    slide.addText(bulletRows, {
      x: bulletsX, y: contentY, w: bulletsW, h: contentH,
      valign: 'top',
      wrap: true,
      lineSpacingMultiple: 1.3,
    })
  }
}

// ─── Main export entry point ──────────────────────────────────────────────────

export async function exportToPptx(dag: Dag): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout  = 'LAYOUT_WIDE'   // 13.33" × 7.5"
  pptx.title   = dag.name
  pptx.subject = 'Application Architecture'

  // 1. Landscape slide
  await addLandscapeSlide(pptx, dag)

  // 2. One slide per application flow
  for (const flow of dag.applicationFlows) {
    if (!flow.mermaidDsl?.trim()) continue
    await addFlowSlide(pptx, dag, flow.name, flow.mermaidDsl)
  }

  await pptx.writeFile({ fileName: `${dag.name.replace(/[^\w\s-]/g, '').trim()}.pptx` })
}
