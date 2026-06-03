"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

interface ProcessingViewProps {
  fileName: string
  label?: string
  maxProgress?: number
  rampDurationMs?: number
}

export function ProcessingView({
  fileName,
  label = "Restoring document…",
  maxProgress = 99,
  rampDurationMs = 1200,
}: ProcessingViewProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(1, elapsed / rampDurationMs)
      const eased = 1 - Math.pow(1 - pct, 3)
      const newProgress = Math.min(maxProgress, eased * maxProgress)
      setProgress(newProgress)
    }, 100)

    return () => clearInterval(interval)
  }, [maxProgress, rampDurationMs])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <Loader2 className="mb-5 size-10 animate-spin text-primary" />
      <p className="text-base font-medium text-foreground">{label}</p>
      <p className="mb-6 mt-2 max-w-xs truncate text-sm text-muted-foreground">{fileName}</p>
      <div className="w-full max-w-xs">
        <div className="flex h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{Math.round(progress)}%</p>
      </div>
    </div>
  )
}
