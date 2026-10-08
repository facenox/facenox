import type {
  AttendanceGroup,
  AttendanceMember,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStats,
  AttendanceReport,
  AttendanceSettings,
  AttendanceEvent,
  AttendanceTimeHealth,
  BulkDetectResponse,
  BulkEnrollResponse,
} from "../types/recognition"

import { HttpClient } from "./attendance/HttpClient"
import { GroupManager } from "./attendance/GroupManager"
import { MemberManager } from "./attendance/MemberManager"
import { RecordManager } from "./attendance/RecordManager"
import { notifyDataChanged } from "../utils/syncNotifier"

const API_BASE_URL = "http://127.0.0.1:7400"
const API_ENDPOINTS = {
  groups: "/attendance/groups",
  members: "/attendance/members",
  records: "/attendance/records",
  sessions: "/attendance/sessions",
  events: "/attendance/events",
  settings: "/attendance/settings",
  stats: "/attendance/stats",
}

export class AttendanceManager {
  private readonly clockCheckStorageKey = "facenox:lastSystemTimeMs"
  private readonly clockBackwardWarnThresholdMs = 60 * 1000

  private httpClient: HttpClient
  private groupManager: GroupManager
  private memberManager: MemberManager
  private recordManager: RecordManager

  private settings: AttendanceSettings | null = null
  private eventQueue: AttendanceEvent[] = []

  constructor() {
    this.httpClient = new HttpClient(API_BASE_URL)
    this.groupManager = new GroupManager(this.httpClient, API_ENDPOINTS)
    this.memberManager = new MemberManager(this.httpClient, API_ENDPOINTS)

    this.recordManager = new RecordManager(
      this.httpClient,
      API_ENDPOINTS,
      this.toApiDateTimeParam.bind(this),
      this.warnIfSystemClockWentBackwards.bind(this),
      this.emitClockWarning.bind(this),
    )
  }

  private async loadSettings(): Promise<void> {
    try {
      this.settings = await this.httpClient.get<AttendanceSettings>(API_ENDPOINTS.settings)
    } catch (error) {
      console.error("[AttendanceManager] Failed to load settings:", error)
    }
  }

  async createGroup(name: string): Promise<AttendanceGroup> {
    if (!this.settings) {
      await this.loadSettings()
    }
    return this.groupManager.createGroup(name, this.settings)
  }

  async getGroups(): Promise<AttendanceGroup[]> {
    return this.groupManager.getGroups()
  }

  async getGroup(groupId: string): Promise<AttendanceGroup | undefined> {
    return this.groupManager.getGroup(groupId)
  }

  async updateGroup(groupId: string, updates: Partial<AttendanceGroup>): Promise<boolean> {
    return this.groupManager.updateGroup(groupId, updates)
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    return this.groupManager.deleteGroup(groupId)
  }

  async getGroupMembers(groupId: string): Promise<AttendanceMember[]> {
    return this.groupManager.getGroupMembers(groupId)
  }

  async addMember(
    groupId: string,
    name: string,
    options?: {
      personId?: string
      role?: string
      email?: string
    },
  ): Promise<AttendanceMember> {
    return this.memberManager.addMember(groupId, name, options)
  }

  async addMembersBulk(
    members: Array<{
      name: string
      role?: string
      email?: string
      personId?: string
    }>,
    groupId: string,
  ): Promise<{
    success_count: number
    error_count: number
    errors: Array<{ person_id: string; error: string }>
    members: AttendanceMember[]
  }> {
    return this.memberManager.addMembersBulk(members, groupId)
  }

  async removeMembersBulk(personIds: string[]): Promise<{
    success_count: number
    error_count: number
    errors: Array<{ person_id: string; error: string }>
  }> {
    return this.memberManager.removeMembersBulk(personIds)
  }

  async getMember(personId: string): Promise<AttendanceMember | undefined> {
    return this.memberManager.getMember(personId)
  }

  async updateMember(personId: string, updates: Partial<AttendanceMember>): Promise<boolean> {
    return this.memberManager.updateMember(personId, updates)
  }

  async getMembers(): Promise<AttendanceMember[]> {
    return this.memberManager.getMembers()
  }

  async removeMember(personId: string): Promise<boolean> {
    return this.memberManager.removeMember(personId)
  }

  async getGroupPersons(groupId: string): Promise<AttendanceMember[]> {
    return this.groupManager.getGroupMembers(groupId)
  }

  async enrollFaceForGroupPerson(
    groupId: string,
    personId: string,
    imageData: Blob | string,
    bbox: number[],
    landmarks_5: number[][],
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.memberManager.enrollFaceForGroupPerson(
      groupId,
      personId,
      imageData,
      bbox,
      landmarks_5,
    )
  }

  async removeFaceDataForGroupPerson(
    groupId: string,
    personId: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.memberManager.removeFaceDataForGroupPerson(groupId, personId)
  }

  async bulkDetectFaces(groupId: string, images: File[]): Promise<BulkDetectResponse> {
    return this.groupManager.bulkDetectFaces(groupId, images)
  }

  async bulkEnrollFaces(
    groupId: string,
    enrollments: {
      person_id: string
      bbox: number[] | { x: number; y: number; width: number; height: number }
      landmarks_5: number[][]
      filename?: string
    }[],
    images: { file: File; filename: string }[],
  ): Promise<BulkEnrollResponse> {
    return this.groupManager.bulkEnrollFaces(groupId, enrollments, images)
  }

  async processAttendanceEvent(
    personId: string,
    confidence: number,
    location?: string,
    livenessStatus?: string,
    livenessConfidence?: number,
  ): Promise<AttendanceEvent | null> {
    const event = await this.recordManager.processAttendanceEvent(
      personId,
      confidence,
      location,
      livenessStatus,
      livenessConfidence,
    )
    if (event) this.eventQueue.push(event)
    return event
  }

  async getGroupStats(groupId: string, date?: Date): Promise<AttendanceStats> {
    return this.recordManager.getGroupStats(groupId, date)
  }

  async generateReport(groupId: string, startDate: Date, endDate: Date): Promise<AttendanceReport> {
    return this.recordManager.generateReport(
      groupId,
      startDate,
      endDate,
      this.getGroup.bind(this),
      this.getGroupMembers.bind(this),
    )
  }

  async addRecord(record: {
    person_id: string
    timestamp?: Date
    confidence?: number
    location?: string
    notes?: string
    is_manual?: boolean
    created_by?: string
  }): Promise<AttendanceRecord> {
    return this.recordManager.addRecord(record)
  }

  async voidRecord(recordId: string, reason: string, voidedBy?: string): Promise<AttendanceRecord> {
    return this.recordManager.voidRecord(recordId, reason, voidedBy)
  }

  async getRecords(filters?: {
    group_id?: string
    person_id?: string
    start_date?: string
    end_date?: string
    limit?: number
    include_voided?: boolean
  }): Promise<AttendanceRecord[]> {
    return this.recordManager.getRecords(filters)
  }

  async getSessions(filters?: {
    group_id?: string
    person_id?: string
    start_date?: string
    end_date?: string
  }): Promise<AttendanceSession[]> {
    return this.recordManager.getSessions(filters)
  }

  async getSettings(): Promise<AttendanceSettings> {
    if (!this.settings) await this.loadSettings()
    return { ...this.settings! }
  }

  async getTimeHealth(): Promise<AttendanceTimeHealth> {
    return this.httpClient.get<AttendanceTimeHealth>("/attendance/settings/time-health")
  }

  async updateSettings(newSettings: Partial<AttendanceSettings>): Promise<void> {
    try {
      const updated = await this.httpClient.put<AttendanceSettings>(
        API_ENDPOINTS.settings,
        newSettings,
      )
      this.settings = updated
      notifyDataChanged()
    } catch (error) {
      console.error("Error updating settings:", error)
      throw error
    }
  }

  async cleanupOldData(daysToKeep = 90): Promise<void> {
    await this.httpClient.post("/attendance/cleanup", {
      days_to_keep: daysToKeep,
    })
    notifyDataChanged()
  }

  async purgeAttendanceHistory(): Promise<void> {
    await this.httpClient.post("/attendance/purge-history")
    notifyDataChanged()
  }

  async exportData(): Promise<string> {
    const data = await this.httpClient.post<Record<string, unknown>>("/attendance/export")
    return JSON.stringify(data, null, 2)
  }

  async downloadAuditLog(startDate?: string, endDate?: string): Promise<void> {
    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    const queryString = params.toString()
    const urlPath =
      queryString ?
        `/attendance/settings/audit-log?${queryString}`
      : "/attendance/settings/audit-log"

    const csv = await this.httpClient.getText(urlPath)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async isBackendAvailable(): Promise<boolean> {
    try {
      await this.httpClient.get("/")
      return true
    } catch {
      return false
    }
  }

  async getBackendStats(): Promise<Record<string, unknown>> {
    try {
      return await this.httpClient.get<Record<string, unknown>>(API_ENDPOINTS.stats)
    } catch {
      return {}
    }
  }

  async getAttendanceStats(): Promise<AttendanceStats> {
    try {
      return await this.httpClient.get<AttendanceStats>("/attendance/stats")
    } catch {
      return {
        total_members: 0,
        present_today: 0,
        absent_today: 0,
        late_today: 0,
      }
    }
  }

  /**
   * Modifies daily attendance sessions to allow human auditing and overrides.
   * This is crucial to correct exceptions, absent markings, and late durations
   * that machine algorithms/scans did not capture or misclassified.
   */
  async updateSession(
    personId: string,
    date: string,
    updates: {
      status?: string
      notes?: string
      check_in_time?: Date
      check_out_time?: Date
      is_late?: boolean
      late_minutes?: number
    },
  ): Promise<AttendanceSession> {
    return this.recordManager.updateSession(personId, date, updates)
  }

  private warnIfSystemClockWentBackwards(): void {
    try {
      const now = Date.now()
      const lastRaw = localStorage.getItem(this.clockCheckStorageKey)
      const last = lastRaw ? Number(lastRaw) : NaN

      if (Number.isFinite(last) && now + this.clockBackwardWarnThresholdMs < last) {
        const diffMs = last - now
        const diffMinutes = Math.max(1, Math.round(diffMs / 60000))
        window.dispatchEvent(
          new CustomEvent("facenox:clock-warning", {
            detail: {
              message: `System clock appears to have moved backwards by more than 1 minute (~${diffMinutes} minute(s)).`,
            },
          }),
        )
      }
      localStorage.setItem(this.clockCheckStorageKey, String(now))
    } catch {
      /* ignore */
    }
  }

  private emitClockWarning(message: string): void {
    window.dispatchEvent(
      new CustomEvent("facenox:clock-warning", {
        detail: { message },
      }),
    )
  }

  private toApiDateTimeParam(date: Date): string {
    return date.toISOString()
  }
}

export const attendanceManager = new AttendanceManager()
