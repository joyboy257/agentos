'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'

type PushState = 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'error'

export function PushNotificationBell() {
  const [pushState, setPushState] = useState<PushState>('unsupported')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setPushState('denied')
      return
    }
    checkSubscription().then(subscribed => {
      setPushState(subscribed ? 'subscribed' : 'prompt')
    })
  }, [])

  async function checkSubscription(): Promise<boolean> {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      return sub !== null
    } catch {
      return false
    }
  }

  async function handleToggle() {
    if (pushState === 'denied' || pushState === 'unsupported') return
    setLoading(true)
    try {
      if (pushState === 'subscribed') {
        // Unsubscribe
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
        }
        setPushState('prompt')
      } else {
        // Subscribe
        let permission = Notification.permission
        if (permission !== 'granted') {
          permission = await Notification.requestPermission()
        }
        if (permission !== 'granted') {
          setPushState('denied')
          setLoading(false)
          return
        }
        const reg = await navigator.serviceWorker.ready
        const vapidKey = (window as unknown as { ENV?: { NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string } }).ENV?.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          console.error('[push] VAPID public key not found')
          setPushState('error')
          setLoading(false)
          return
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
        setPushState('subscribed')
      }
    } catch (err) {
      console.error('[push] error:', err)
      setPushState('error')
    }
    setLoading(false)
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
  }

  if (pushState === 'unsupported' || pushState === 'denied') return null

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      title={pushState === 'subscribed' ? 'Notifications on — click to disable' : 'Enable notifications'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: pushState === 'subscribed' ? '#f0fdf4' : '#ffffff',
        border: `1px solid ${pushState === 'subscribed' ? '#bbf7d0' : '#e5e5e3'}`,
        borderRadius: 8,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 500,
        color: pushState === 'subscribed' ? '#16a34a' : '#6b6b68',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {pushState === 'subscribed' ? <BellOff size={14} /> : <Bell size={14} />}
      {pushState === 'subscribed' ? 'Notifications on' : 'Enable notifications'}
    </button>
  )
}