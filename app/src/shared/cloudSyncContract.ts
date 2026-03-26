import { z } from "zod"

export const attendanceStatusSchema = z.enum(["present", "absent"])

export const groupSettingsSchema = z.object({
  late_threshold_minutes: z.number().nullable().optional(),
  late_threshold_enabled: z.boolean().default(false),
  class_start_time: z.string().nullable().optional(),
  track_checkout: z.boolean().default(false),
})

export const attendanceGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().datetime(),
  is_active: z.boolean(),
  settings: groupSettingsSchema,
})

export const attendanceMemberSchema = z.object({
  person_id: z.string().min(1),
  group_id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  joined_at: z.string().datetime(),
  is_active: z.boolean(),
  has_consent: z.boolean(),
  consent_granted_at: z.string().datetime().nullable().optional(),
  consent_granted_by: z.string().nullable().optional(),
})

export const attendanceRecordSchema = z.object({
  id: z.string().min(1),
  person_id: z.string().min(1),
  group_id: z.string().min(1),
  timestamp: z.string().datetime(),
  confidence: z.number(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_manual: z.boolean(),
  created_by: z.string().nullable().optional(),
})

export const attendanceSessionSchema = z.object({
  id: z.string().min(1),
  person_id: z.string().min(1),
  group_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_in_time: z.string().datetime().nullable().optional(),
  check_out_time: z.string().datetime().nullable().optional(),
  total_hours: z.number().nullable().optional(),
  status: attendanceStatusSchema,
  is_late: z.boolean(),
  late_minutes: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const attendanceSettingsSchema = z.object({
  late_threshold_minutes: z.number(),
  enable_location_tracking: z.boolean(),
  confidence_threshold: z.number(),
  attendance_cooldown_seconds: z.number(),
  relog_cooldown_seconds: z.number(),
  enable_liveness_detection: z.boolean(),
  data_retention_days: z.number(),
})

export const attendanceExportSchema = z.object({
  groups: z.array(attendanceGroupSchema),
  members: z.array(attendanceMemberSchema),
  records: z.array(attendanceRecordSchema),
  sessions: z.array(attendanceSessionSchema),
  settings: attendanceSettingsSchema,
  exported_at: z.string().datetime(),
})

export const syncPushSchema = z.object({
  schema_version: z.literal(1),
  snapshot_id: z.string().min(1),
  device_id: z.string().uuid(),
  site_id: z.string().uuid(),
  app_version: z.string().min(1),
  exported_at: z.string().datetime(),
  attendance_export: attendanceExportSchema,
})

export type SyncPushPayload = z.infer<typeof syncPushSchema>
