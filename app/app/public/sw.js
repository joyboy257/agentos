self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag,
    data: data.data,
    actions: data.actions || [],
    requireInteraction: true,
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const { runId, toolCallId, agentId } = event.notification.data ?? {}

  if (event.action === 'approve') {
    event.waitUntil(
      fetch(`/api/approvals/${toolCallId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, toolCallId, decision: 'approved' }),
      }).then(() => {
        event.notification.close()
      })
    )
  } else if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/canvas') && 'focus' in client) {
            client.focus()
            client.postMessage({ type: 'OPEN_RUN', runId, toolCallId })
            return
          }
        }
        return clients.openWindow(`/canvas?run=${runId}`)
      })
    )
  }
})
