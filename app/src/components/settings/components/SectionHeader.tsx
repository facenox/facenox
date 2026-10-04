import React from "react"
import { AnimatePresence } from "framer-motion"

interface SectionHeaderProps {
  children: React.ReactNode
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <div className="sticky top-0 z-20 flex h-[57px] items-center border-b border-white/[0.04] bg-[#06080c] pr-16 pl-10">
      <div className="flex w-full min-w-0 items-center justify-between gap-4">{children}</div>
    </div>
  )
}

interface BreadcrumbsProps {
  children: React.ReactNode
}

export function Breadcrumbs({ children }: BreadcrumbsProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[13px] font-medium">
      {children}
    </div>
  )
}

interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
  active?: boolean
  onClick?: (e: React.MouseEvent) => void
  color?: string
  className?: string
}

export const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  ({ children, active, onClick, color, className = "", ...rest }, ref) => {
    const baseColor = color || "text-white/45"

    if (onClick && !active) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          onClick={onClick}
          {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          className={`inline-block cursor-pointer border-none bg-transparent p-0 align-bottom text-[13px] transition-colors duration-150 focus:outline-none ${baseColor} max-w-full truncate font-medium tracking-wide hover:text-white ${className}`}>
          {children}
        </button>
      )
    }

    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        {...(rest as React.HTMLAttributes<HTMLSpanElement>)}
        className={`inline-block max-w-full truncate align-bottom text-[13px] transition-colors duration-150 ${
          active ?
            "font-semibold tracking-wide text-white"
          : `${baseColor} font-medium tracking-wide`
        } ${className}`}>
        {children}
      </span>
    )
  },
)
Breadcrumb.displayName = "Breadcrumb"

export function Separator() {
  return <span className="shrink-0 text-[13px] font-light text-white/15 select-none">/</span>
}

interface ActionsProps {
  children: React.ReactNode
}

export function Actions({ children }: ActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <AnimatePresence mode="popLayout">{children}</AnimatePresence>
    </div>
  )
}

SectionHeader.Breadcrumbs = Breadcrumbs
SectionHeader.Breadcrumb = Breadcrumb
SectionHeader.Separator = Separator
SectionHeader.Actions = Actions
