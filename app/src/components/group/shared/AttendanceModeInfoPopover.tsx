import { InfoPopover } from "@/components/shared"

const ATTENDANCE_MODE_DETAILS = [
  {
    label: "Attendance",
    description: "Records one presence per member each day.",
  },
  {
    label: "Time in & time out",
    description: "Records one arrival and departure per member each day.",
  },
  {
    label: "Visits",
    description: "Records separate visits when members leave and return.",
  },
] as const

export function AttendanceModeInfoPopover() {
  return (
    <InfoPopover
      title="Attendance mode"
      description="Choose what to record for this group."
      detailsNode={ATTENDANCE_MODE_DETAILS.map(({ label, description }) => (
        <span key={label}>
          <span className="font-semibold text-white/80">{label}</span>
          {`: ${description}`}
        </span>
      ))}
      side="right"
    />
  )
}
