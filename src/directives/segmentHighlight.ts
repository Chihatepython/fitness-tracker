import type { ObjectDirective } from 'vue'

const currentSelector = '[aria-pressed="true"], [aria-current="step"], [aria-current="page"]'

interface HighlightState {
  observer: ResizeObserver
  frame: number
}

const states = new WeakMap<HTMLElement, HighlightState>()

function positionHighlight(track: HTMLElement, item: Element | null): void {
  if (!(item instanceof HTMLElement)) return

  const trackRect = track.getBoundingClientRect()
  const itemRect = item.getBoundingClientRect()
  track.style.setProperty('--segment-highlight-x', `${itemRect.left - trackRect.left + track.scrollLeft}px`)
  track.style.setProperty('--segment-highlight-width', `${itemRect.width}px`)
  track.style.setProperty('--segment-highlight-color', getComputedStyle(item).getPropertyValue('--segment-selected-fill').trim() || '#e3ecdf')
}

function syncHighlight(track: HTMLElement): void {
  const active = track.querySelector(`:scope > :is(${currentSelector})`)
  track.toggleAttribute('data-segment-highlight', active !== null)
  positionHighlight(track, active)
}

export const vSegmentHighlight: ObjectDirective<HTMLElement, number | undefined> = {
  mounted(track, binding) {
    const previous = binding.value === undefined ? null : track.children.item(binding.value)
    const active = track.querySelector(`:scope > :is(${currentSelector})`)
    if (previous && active && previous !== active) {
      track.setAttribute('data-segment-highlight', '')
      positionHighlight(track, previous)
    } else {
      syncHighlight(track)
    }

    const observer = new ResizeObserver(() => {
      if (track.hasAttribute('data-segment-ready')) syncHighlight(track)
    })
    observer.observe(track)
    const state: HighlightState = { observer, frame: 0 }
    state.frame = requestAnimationFrame(() => {
      state.frame = requestAnimationFrame(() => {
        track.setAttribute('data-segment-ready', '')
        syncHighlight(track)
      })
    })
    states.set(track, state)
  },
  updated(track) {
    if (track.hasAttribute('data-segment-ready')) syncHighlight(track)
  },
  unmounted(track) {
    const state = states.get(track)
    if (!state) return
    state.observer.disconnect()
    cancelAnimationFrame(state.frame)
    states.delete(track)
  },
}
