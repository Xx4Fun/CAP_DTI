// Only foreground online sessions refresh regulatory data. Mutations notify every open view immediately.
export function regulatoryRefresh(refresh: () => void) {
  const visible = () => { if (navigator.onLine && document.visibilityState === 'visible') refresh() }
  const timer = window.setInterval(visible, 60_000)
  window.addEventListener('focus', visible)
  window.addEventListener('online', visible)
  window.addEventListener('regulatory-data-changed', visible)
  document.addEventListener('visibilitychange', visible)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', visible)
    window.removeEventListener('online', visible)
    window.removeEventListener('regulatory-data-changed', visible)
    document.removeEventListener('visibilitychange', visible)
  }
}
