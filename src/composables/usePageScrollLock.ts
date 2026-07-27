import { onBeforeUnmount } from 'vue'

export function usePageScrollLock() {
  let scrollPosition = 0
  let isLocked = false

  function lockPageScroll(): void {
    if (isLocked) return

    scrollPosition = window.scrollY
    document.body.style.top = `-${scrollPosition}px`
    document.body.classList.add('page-scroll-locked')
    isLocked = true
  }

  function unlockPageScroll(): void {
    if (!isLocked) return

    document.body.classList.remove('page-scroll-locked')
    document.body.style.removeProperty('top')
    window.scrollTo(0, scrollPosition)
    isLocked = false
  }

  onBeforeUnmount(unlockPageScroll)

  return {
    lockPageScroll,
    unlockPageScroll,
  }
}
