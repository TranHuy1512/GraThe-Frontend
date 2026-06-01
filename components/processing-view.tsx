"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

interface ProcessingViewProps {
  fileName: string
  durationMs?: number
}

export function ProcessingView({ fileName, durationMs = 5000 }: ProcessingViewProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const newProgress = Math.min(100, (elapsed / durationMs) * 100)
      setProgress(newProgress)
    }, 100)

    return () => clearInterval(interval)
  }, [durationMs])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <Loader2 className="mb-5 size-10 animate-spin text-primary" />
      <p className="text-base font-medium text-foreground">Restoring document…</p>
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
