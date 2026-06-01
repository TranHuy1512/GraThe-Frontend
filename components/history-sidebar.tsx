"use client"

import { Plus, FileText, ImageIcon, Trash2, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface HistoryEntry {
  id: string
  mode: "image" | "pdf"
  fileName: string
  thumbUrl: string
  pageCount: number
  createdAt: number
}

interface HistorySidebarProps {
  entries: HistoryEntry[]
  activeId: string | null
  onSelect: (id: string) => void
  onUploadNew: () => void
  onRemove: (id: string) => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function HistorySidebar({ entries, activeId, onSelect, onUploadNew, onRemove }: HistorySidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <Button className="w-full justify-center" onClick={onUploadNew}>
        <Plus className="size-4" />
        Upload new image/files
      </Button>

      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <History className="size-3.5" />
        History
        {entries.length > 0 && <span className="ml-auto font-normal normal-case">{entries.length}</span>}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Restored documents from this session will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {entries.map((entry) => {
            const isActive = entry.id === activeId
            return (
              <li key={entry.id}>
                <div
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors",
                    isActive
                      ? "border-primary bg-accent"
                      : "border-border bg-card hover:border-primary/50 hover:bg-accent/40",
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelect(entry.id)
                    }
                  }}
                  aria-current={isActive}
                  aria-label={`Open ${entry.fileName}`}
                >
                  <div className="size-12 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.thumbUrl || "/placeholder.svg"} alt="" className="size-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{entry.fileName}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {entry.mode === "pdf" ? <FileText className="size-3" /> : <ImageIcon className="size-3" />}
                      {entry.mode === "pdf" ? `${entry.pageCount}p` : "Image"}
                      <span aria-hidden>·</span>
                      {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.fileName} from history`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(entry.id)
                    }}
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
