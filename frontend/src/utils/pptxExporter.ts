import PptxGenJS from 'pptxgenjs'
import mermaid from 'mermaid'
import type { Dag } from '@/types/dag'
import { generateLandscapeDsl } from './landscapeDslGenerator'
import { buildSequenceDsl } from './sequenceDslGenerator'

// Widescreen 13.33" × 7.5"
const SLIDE_W = 13.33
const SLIDE_H = 7.5

// Corporate colours (neutral — adapt to template later)
const COLOR_TITLE_BG  = '1F3864'   // dark blue
const COLOR_TITLE_FG  = 'FFFFFF'
const COLOR_ACCENT    = 'F5C400'   // yellow for step bullets

// ─── Mermaid → SVG data URI ───────────────────────────────────────────────────

async function renderMermaidToSvgDataUrl(dsl: string): Promise<string> {
  const id = `pptx-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { svg } = await mermaid.render(id, dsl)
  // Encode SVG as base64 data URI — avoids canvas tainted-origin restrictions
  const b64 = btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${b64}`
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

async function addLandscapeSlide(pptx: PptxGenJS, dag: Dag) {
  const slide = pptx.addSlide()
  addTitleBar(slide, dag.name + ' — Application Landscape')

  const dsl = generateLandscapeDsl(dag, { useElk: false })
  const png = await renderMermaidToSvgDataUrl(dsl)

  // Image fills the area below the title bar
  const imgY = 0.6
  const imgH = SLIDE_H - imgY - 0.1
  slide.addImage({ data: png, x: 0.2, y: imgY, w: SLIDE_W - 0.4, h: imgH, sizing: { type: 'contain', w: SLIDE_W - 0.4, h: imgH } })
}

async function addFlowSlide(pptx: PptxGenJS, dag: Dag, flowName: string, flowBody: string) {
  const slide = pptx.addSlide()
  addTitleBar(slide, flowName)

  const fullDsl = buildSequenceDsl(flowBody, dag)
  const png = await renderMermaidToSvgDataUrl(fullDsl)

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
