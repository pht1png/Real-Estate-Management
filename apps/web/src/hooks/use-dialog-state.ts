import { useState } from "react"

/**
 * Open/close state for a sheet or dialog that acts on one value (usually a table row).
 * The value is kept after closing so the content doesn't vanish during the close animation.
 * `key` changes on every open: pass it as the component's `key` so forms start fresh each time.
 */
export function useDialogState<T>() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<T | null>(null)
  const [key, setKey] = useState(0)
  return {
    open,
    value,
    key,
    show: (next: T | null) => {
      setValue(next)
      setKey((k) => k + 1)
      setOpen(true)
    },
    setOpen,
    close: () => setOpen(false),
  }
}
