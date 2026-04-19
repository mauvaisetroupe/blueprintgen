/**
 * pptxSequenceOverlay — overlay des numéros cerclés sur les diagrammes de séquence et d'activité.
 *
 * Principe :
 *   • Le PNG du diagramme contient déjà les ① ② … dans les labels Mermaid
 *     (injectés par numberForwardArrows / buildActivityDsl).
 *   • On pose par-dessus un text pptxgenjs avec fond ellipse blanc (shape + fill)
 *     pour cacher le ① du label et le remplacer par un numéro cerclé stylisé.
 *   • Un seul élément PowerPoint → déplaçable en un clic par l'architecte.
 *
 * Positionnement :
 *   • Sequence : Mermaid place les `text.messageText` dans le SVG dans le même ordre
 *     que les steps du DSL (forward + return confondus).
 *   • Activity : les `.edgeLabel text` apparaissent dans l'ordre des arêtes déclarées
 *     dans buildActivityDsl (forward uniquement si showReturns: false).
 */

import type PptxGenJS from 'pptxgenjs'
import type { FlowStep } from '@/types/dag'

const CIRCLED_DIGITS = [
  '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
  '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
]

// Taille de l'overlay (en pouces)
const OVERLAY_SIZE   = 0.30
const OVERLAY_COLOR  = '2D6FBF'   // bleu — même que les bullets du panneau droit

// Décalage horizontal en pouces : le ① est au début du label centré (text-anchor="middle"),
// donc svgX pointe sur le centre du texte, pas sur le ①. On compense vers la gauche.
const LABEL_START_OFFSET_IN = 0.15

export interface OverlayPosition {
  circle: string
  svgX:   number   // centre X dans l'espace SVG (pixels)
  svgY:   number   // centre Y dans l'espace SVG (pixels)
}

/**
 * Extrait les positions des labels de flèches forward depuis un SVG Mermaid sequence.
 * Utilise flow.steps pour identifier les indices forward vs return.
 * Les text.messageText apparaissent dans le même ordre que tous les steps (forward + return).
 */
export function extractSequenceStepPositions(
  svgString: string,
  steps: FlowStep[],
): OverlayPosition[] {
  const div = document.createElement('div')
  div.innerHTML = svgString
  const svg = div.querySelector('svg')
  if (!svg) return []

  const msgTexts = Array.from(svg.querySelectorAll<SVGTextElement>('text.messageText'))

  const result: OverlayPosition[] = []
  let circleIdx = 0

  steps.forEach((step, i) => {
    if (step.isReturn) return   // retour → pas de numéro
    const el = msgTexts[i]
    if (!el) return

    const x = parseFloat(el.getAttribute('x') ?? '0')
    // y = baseline du texte ; on remonte légèrement pour centrer sur la flèche
    const y = parseFloat(el.getAttribute('y') ?? '0') - 6

    result.push({
      circle: CIRCLED_DIGITS[circleIdx++] ?? `${circleIdx}.`,
      svgX: x,
      svgY: y,
    })
  })

  return result
}

/**
 * Extrait les positions des labels d'arêtes forward depuis un SVG Mermaid flowchart (activity).
 * Les .edgeLabel text apparaissent dans l'ordre des arêtes du DSL — uniquement les forwards
 * (buildActivityDsl ne numérote que les forwards).
 */
export function extractActivityStepPositions(
  svgString: string,
  forwardCount: number,
): OverlayPosition[] {
  const div = document.createElement('div')
  div.innerHTML = svgString
  const svg = div.querySelector('svg')
  if (!svg) return []

  // Mermaid flowchart avec htmlLabels:false → labels dans g.edgeLabel > g > text
  const labelEls = Array.from(svg.querySelectorAll<SVGTextElement>('g.edgeLabel text'))

  const result: OverlayPosition[] = []

  for (let i = 0; i < Math.min(forwardCount, labelEls.length); i++) {
    const el = labelEls[i]
    // g.edgeLabel est transformé (translate) — getBBox n'est pas disponible hors DOM monté,
    // on remonte via les attributs transform de l'ancêtre
    const labelGroup = el.closest('g.edgeLabel')
    if (!labelGroup) continue

    const transform = (labelGroup as SVGGElement).getAttribute('transform') ?? ''
    const m = transform.match(/translate\(\s*([\d.+-]+)[\s,]+([\d.+-]+)\s*\)/)
    const offsetX = m ? parseFloat(m[1]) : 0
    const offsetY = m ? parseFloat(m[2]) : 0

    const x = offsetX + parseFloat(el.getAttribute('x') ?? '0')
    const y = offsetY + parseFloat(el.getAttribute('y') ?? '0') - 4

    result.push({
      circle: CIRCLED_DIGITS[i] ?? `${i + 1}.`,
      svgX: x,
      svgY: y,
    })
  }

  return result
}

/**
 * Ajoute les overlays sur la slide PowerPoint.
 * Chaque overlay = un seul élément : text avec shape ellipse + fond blanc.
 * Un seul élément → déplaçable directement dans PowerPoint.
 */
export function addNumberOverlays(
  slide: PptxGenJS.Slide,
  positions: OverlayPosition[],
  svgW: number,
  svgH: number,
  imgPlacement: { x: number; y: number; w: number; h: number },
): void {
  if (positions.length === 0) return

  const scaleX = imgPlacement.w / svgW
  const scaleY = imgPlacement.h / svgH

  for (const { circle, svgX, svgY } of positions) {
    // svgX est le centre du label (text-anchor="middle") ; le ① est au début du texte,
    // donc on décale vers la gauche pour le couvrir.
    const cx = imgPlacement.x + svgX * scaleX - LABEL_START_OFFSET_IN
    const cy = imgPlacement.y + svgY * scaleY

    const x = cx - OVERLAY_SIZE / 2
    const y = cy - OVERLAY_SIZE / 2

    // Un seul élément : ellipse blanche + numéro cerclé stylisé → déplaçable d'un bloc
    slide.addText(circle, {
      shape: 'ellipse' as PptxGenJS.ShapeType,
      x, y, w: OVERLAY_SIZE, h: OVERLAY_SIZE,
      fill: { color: 'FFFFFF' },
      line: { color: 'FFFFFF' },
      fontSize: 16, bold: true, color: OVERLAY_COLOR,
      align: 'center', valign: 'middle',
    })
  }
}
