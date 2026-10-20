import { createContext, useContext } from 'react'
import type { MotionValue } from 'framer-motion'
import { MathUtils } from 'three'
import type { ObjectKind } from './LandingScene'

export function journeyBlend(value: number, start: number, end: number) {
  const t = MathUtils.clamp((value - start) / (end - start), 0, 1)
  return t * t * (3 - 2 * t)
}
type JourneyPose = { progress: number; dock: number; aspect: number; interactive: boolean; moving: boolean }
export class WarehouseJourneyController {
  private surface: HTMLDivElement | null = null
  private story: HTMLDivElement | null = null
  private target: HTMLDivElement | null = null
  private pauseButton: HTMLButtonElement | null = null
  private selected: ObjectKind | null = null
  private explore: (() => void) | null = null
  private invalidate: (() => void) | null = null
  private reduced = false
  private fallback = false
  private current = -1
  private endScroll = 1
  private lastScroll = 0
  private wasActive = true
  private layoutUntil = 0
  private applicationShift = 0
  private result: JourneyPose = { progress: 0, dock: 0, aspect: 1, interactive: false, moving: false }
  private readonly progress: MotionValue<number>
  private readonly onActive: (active: boolean) => void
  constructor(progress: MotionValue<number>, onActive: (active: boolean) => void) {
    this.progress = progress
    this.onActive = onActive
  }
  bindSurface = (node: HTMLDivElement | null) => {
    this.surface = node
  }
  bindStory = (node: HTMLDivElement | null) => {
    this.story = node
  }
  bindTarget = (node: HTMLDivElement | null) => {
    this.target = node
  }
  bindPause = (node: HTMLButtonElement | null) => {
    this.pauseButton = node
  }
  setReduced(reduced: boolean) {
    this.reduced = reduced
    this.wake()
  }
  setSelection(selected: ObjectKind | null, explore: () => void) {
    if (this.selected !== selected) this.layoutUntil = performance.now() + 800
    this.selected = selected
    this.explore = explore
    this.wake()
  }
  exploreWarehouse() {
    if (!this.selected) this.explore?.()
  }
  connectRenderer(invalidate: () => void) {
    this.invalidate = invalidate
    return () => {
      if (this.invalidate === invalidate) this.invalidate = null
    }
  }
  wake = () => {
    if (this.fallback) this.update(0)
    else this.invalidate?.()
  }
  showFallback() {
    this.fallback = true
    this.update(0)
  }
  update(delta: number): JourneyPose {
    const node = this.surface
    const chapter = this.story
    const destination = this.target
    if (!node || !chapter || !destination) return this.result
    const width = node.offsetWidth
    const height = node.offsetHeight
    const compact = width <= 800
    const staticView = this.reduced || this.fallback
    const chapterRect = chapter.getBoundingClientRect()
    const destinationRect = destination.getBoundingClientRect()
    const application = destination.closest<HTMLElement>('.lp-applications')!
    const applicationTop = application.getBoundingClientRect().top - this.applicationShift
    const destinationTop = destinationRect.top - this.applicationShift
    const top = chapterRect.top + scrollY
    // Expanding a card changes its geometry, never the completed scroll timeline.
    if (this.selected === null && performance.now() > this.layoutUntil) {
      this.endScroll = compact
        ? top + chapterRect.height - height * 0.15
        : destinationTop + scrollY - Math.max(150, (height - destinationRect.height) * 0.4)
    }
    const distance = Math.max(height * 2.6, this.endScroll - top)
    const desired = this.selected ? 1 : MathUtils.clamp((scrollY - top) / distance, 0, 1)
    const jumped = Math.abs(scrollY - this.lastScroll) > height * 0.7
    this.current =
      this.current < 0 || jumped || staticView
        ? desired
        : MathUtils.damp(this.current, desired, 16, Math.min(delta, 0.05))
    if (Math.abs(this.current - desired) < 0.00015) this.current = desired
    this.lastScroll = scrollY
    this.progress.set(this.current)
    const applicationShift =
      compact || staticView
        ? 0
        : Math.min(0, 96 - applicationTop) *
          journeyBlend(this.current, 0.66, 0.84) *
          (1 - journeyBlend(this.current, 0.9, 1))
    const applicationReveal = compact || staticView ? 1 : journeyBlend(this.current, 0.86, 0.94)
    application.style.transform = applicationShift ? `translate3d(0,${applicationShift}px,0)` : 'none'
    application.style.opacity = String(applicationReveal)
    application.inert = applicationReveal < 0.5
    this.applicationShift = applicationShift
    const visibleDestinationTop = destinationTop + applicationShift
    let dock = journeyBlend(this.current, 0.68, 0.98)
    let x = destinationRect.left * dock
    let y = visibleDestinationTop * dock
    let modelWidth = MathUtils.lerp(width, destinationRect.width, dock)
    let modelHeight = MathUtils.lerp(height, destinationRect.height, dock)
    if (staticView && chapterRect.bottom > height * 0.4) {
      dock = 0
      x = compact ? 0 : width * 0.42
      y = compact ? height * 0.47 : height * 0.14
      modelWidth = compact ? width : width * 0.58
      modelHeight = compact ? height * 0.48 : height * 0.76
    } else if (staticView) {
      dock = 1
      x = destinationRect.left
      y = visibleDestinationTop
      modelWidth = destinationRect.width
      modelHeight = destinationRect.height
    }
    const cardOpacity = dock === 1 ? Number(getComputedStyle(destination.closest('.lp-object')!).opacity) : 1
    const visible =
      !document.hidden &&
      cardOpacity > 0.001 &&
      y < innerHeight &&
      y + modelHeight > 0 &&
      x < width &&
      x + modelWidth > 0
    const interactive = visible && dock === 1 && (this.selected === null || this.selected === 'warehouse')
    node.style.transform = `translate3d(${x}px,${y}px,0) scale(${modelWidth / width},${modelHeight / height})`
    node.style.visibility = visible ? 'visible' : 'hidden'
    node.style.pointerEvents = interactive ? 'auto' : 'none'
    node.style.setProperty('--journey-model-opacity', String(cardOpacity))
    node.style.setProperty('--journey-shade', String(staticView ? 0 : 1 - journeyBlend(this.current, 0.08, 0.57)))
    node.parentElement!.style.setProperty(
      '--journey-row',
      String(staticView ? 1 : journeyBlend(this.current, 0.82, 0.98)),
    )
    node.parentElement!.style.setProperty('--journey-hero-chrome', String(1 - journeyBlend(this.current, 0.62, 0.82)))
    node.parentElement!.style.setProperty('--journey-hero-visibility', this.current >= 0.82 ? 'hidden' : 'visible')
    node.dataset.progress = this.current.toFixed(5)
    node.dataset.docked = String(interactive)
    if (this.pauseButton) {
      const preview = destination.parentElement!.getBoundingClientRect()
      this.pauseButton.style.transform = `translate3d(${preview.right - 50}px,${preview.bottom - 40}px,0)`
      this.pauseButton.hidden = !interactive
    }
    if (visible !== this.wasActive) {
      this.wasActive = visible
      this.onActive(visible)
    }
    this.result.progress = staticView ? 1 : this.current
    this.result.dock = dock
    this.result.aspect = modelWidth / Math.max(1, modelHeight)
    this.result.interactive = interactive
    this.result.moving = this.current !== desired || performance.now() < this.layoutUntil
    return this.result
  }
}
export type WarehouseJourneyContext = {
  controller: WarehouseJourneyController
  progress: MotionValue<number>
  paused: boolean
  togglePaused: () => void
}
export const WarehouseContext = createContext<WarehouseJourneyContext | null>(null)
export const useWarehouseJourney = () => useContext(WarehouseContext)
