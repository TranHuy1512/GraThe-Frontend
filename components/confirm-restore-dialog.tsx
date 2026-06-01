"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmRestoreDialogProps {
  open: boolean
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmRestoreDialog({
  open,
  fileName,
  onConfirm,
  onCancel,
}: ConfirmRestoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm restoration</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to restore this document?
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
