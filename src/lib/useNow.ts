import { useEffect, useState } from 'react'

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs])

  return now
}
