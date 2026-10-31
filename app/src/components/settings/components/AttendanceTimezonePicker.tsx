import { useMemo } from "react"
import { Dropdown } from "@/components/shared"
import type { DropdownOption } from "@/components/shared/Dropdown"

interface AttendanceTimezonePickerProps {
  value: string
  onChange: (timeZone: string) => void
  disabled?: boolean
}

interface TimeZoneDetail {
  city: string
  label: string
}

const timeZoneDetailsCache = new Map<string, TimeZoneDetail>()

function timeZoneDetails(timeZone: string): TimeZoneDetail {
  const cached = timeZoneDetailsCache.get(timeZone)
  if (cached) return cached

  let detail: TimeZoneDetail
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
    detail = { city, label: offset ? `${city} (${offset})` : city }
  } catch {
    const city = timeZone.split("/").at(-1)?.replaceAll("_", " ") ?? timeZone
    detail = { city, label: city }
  }

  timeZoneDetailsCache.set(timeZone, detail)
  return detail
}

let cachedBaseTimeZones: string[] | null = null

function getBaseTimeZones(): string[] {
  if (cachedBaseTimeZones) return cachedBaseTimeZones
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
  ).supportedValuesOf
  const zones = new Set(["UTC", ...(supportedValuesOf?.("timeZone") ?? [])])
  cachedBaseTimeZones = [...zones].sort()
  return cachedBaseTimeZones
}

function supportedTimeZones(current: string): string[] {
  const base = getBaseTimeZones()
  if (!current || !base.includes(current)) {
    return current ? [current, ...base] : base
  }
  return [current, ...base.filter((zone) => zone !== current)]
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
      maxVisibleOptions={50}
      getOptionSearchText={(option) => {
        const timeZone = String(option.value)
        const details = timeZoneDetails(timeZone)
        const offset = details.label.match(/UTC([+-]\d{2}:\d{2})/)?.[1]
        const offsetShort = offset ? offset.replace(/([+-])0?(\d+):00/, "$1$2") : ""
        return `${timeZone} ${timeZone.replaceAll("_", " ")} ${details.city} ${offset ?? ""} ${offsetShort}`
      }}
      renderOption={(option, isSelected) => {
        const timeZone = String(option.value)
        const details = timeZoneDetails(timeZone)
        return (
          <span className="block min-w-0 text-left">
            <span
              className={`block truncate ${isSelected ? "text-cyan-300" : "text-white/85 group-hover:text-white"}`}>
              {details.label}
            </span>
            <span
              className={`mt-0.5 block truncate text-[10px] ${isSelected ? "text-cyan-400/60" : "text-white/35 group-hover:text-white/55"}`}>
              {timeZone}
            </span>
          </span>
        )
      }}
      showPlaceholderOption={false}
      allowClear={false}
      emptyMessage="No matching timezones."
      maxHeight={200}
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
