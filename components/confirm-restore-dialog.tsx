"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ClassificationResult } from "@/lib/classification-api"
import { DOCUMENT_CLASS_ID, PHOTO_CLASS_ID } from "@/lib/classification-api"

interface ConfirmRestoreDialogProps {
  open: boolean
  fileName: string
  classification?: ClassificationResult | null
  classificationError?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmRestoreDialog({
  open,
  fileName,
  classification,
  classificationError,
  onConfirm,
  onCancel,
}: ConfirmRestoreDialogProps) {
  const isDocument = classification?.predicted_class_id === DOCUMENT_CLASS_ID
  const isPhoto = classification?.predicted_class_id === PHOTO_CLASS_ID
  const confidence = classification ? Math.round(classification.confidence * 100) : null
  const message = classificationError
    ? "We couldn't verify whether this image is a document. You can still continue if you are sure this is a scanned document."
    : isPhoto
      ? `We think it's not a document. The classifier predicted this image as "${classification.predicted_class}" with ${confidence}% confidence. You can still restore it if this is actually a scanned document.`
      : isDocument
        ? "Are you sure you want to restore this document?"
        : "Are you sure you want to restore this document?"

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm restoration</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {message}
          </p>
          <div className="truncate rounded bg-secondary px-3 py-2 font-mono text-xs text-foreground">
            {fileName}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Restore</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
