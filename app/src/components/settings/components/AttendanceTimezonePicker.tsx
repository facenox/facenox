import { useMemo } from "react"
import { Dropdown } from "@/components/shared"
import type { DropdownOption } from "@/components/shared/Dropdown"

interface AttendanceTimezonePickerProps {
  value: string
  onChange: (timeZone: string) => void
  disabled?: boolean
}

function timeZoneDetails(timeZone: string) {
  try {
    const zone = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone
    const city = zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone
    const offsetPart = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value
    const offset = offsetPart === "GMT" ? "UTC+00:00" : offsetPart?.replace(/^GMT/, "UTC")
    return { city, label: offset ? `${city} (${offset})` : city }
  } catch {
    const city = timeZone.split("/").at(-1)?.replaceAll("_", " ") ?? timeZone
    return { city, label: city }
  }
}

function supportedTimeZones(current: string) {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
  ).supportedValuesOf
  const zones = new Set([current, "UTC", ...(supportedValuesOf?.("timeZone") ?? [])])
  return [current, ...[...zones].filter((zone) => zone !== current).sort()]
}

export function AttendanceTimezonePicker({
  value,
  onChange,
  disabled = false,
}: AttendanceTimezonePickerProps) {
  const options = useMemo<DropdownOption<string>[]>(
    () => supportedTimeZones(value).map((timeZone) => ({ value: timeZone, label: timeZone })),
    [value],
  )
  const selected = timeZoneDetails(value)

  return (
    <Dropdown
      ariaLabel="Attendance timezone"
      options={options}
      value={value}
      onChange={(nextValue) => {
        if (typeof nextValue === "string") onChange(nextValue)
      }}
      disabled={disabled}
      searchable
      searchPlaceholder="Search city or timezone..."
      searchAriaLabel="Search attendance timezones"
      getOptionSearchText={(option) => {
        const timeZone = String(option.value)
        const city = timeZone.split("/").at(-1)?.replaceAll("_", " ") ?? timeZone
        return `${timeZone} ${timeZone.replaceAll("_", " ")} ${city}`
      }}
      renderOption={(option, selected) => {
        const timeZone = String(option.value)
        const details = timeZoneDetails(timeZone)
        return (
          <span className="block min-w-0 text-left">
            <span
              className={`block truncate ${selected ? "text-cyan-300" : "text-white/85 group-hover:text-white"}`}>
              {details.label}
            </span>
            <span
              className={`mt-0.5 block truncate text-[10px] ${selected ? "text-cyan-400/60" : "text-white/35 group-hover:text-white/55"}`}>
              {timeZone}
            </span>
          </span>
        )
      }}
      showPlaceholderOption={false}
      allowClear={false}
      emptyMessage="No matching timezones."
      maxHeight={280}
      menuWidth={360}
      align="right"
      className="w-[280px] max-w-full shrink-0"
      buttonClassName="h-11 border-white/10 bg-white/[0.04] px-3 py-1.5 hover:border-white/20 hover:bg-white/[0.06] disabled:hover:border-white/10 disabled:hover:bg-white/[0.04]"
      optionClassName="group py-2"
      trigger={
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium text-white/90">{selected.label}</span>
          <span className="truncate text-[10px] font-normal text-white/40">{value}</span>
        </span>
      }
    />
  )
}
