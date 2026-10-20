import { X } from "lucide-react"

interface ModalCloseButtonProps {
  onClick: () => void
}

export function ModalCloseButton({ onClick }: ModalCloseButtonProps) {
  return (
    <button
      onClick={onClick}
      className="-mt-1.5 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent p-0 text-white/45 shadow-none transition-all duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none active:scale-95"
      aria-label="Close dialog">
      <X className="size-4" />
    </button>
  )
}
