import type { AttendanceMember } from "../../types/recognition"
import type { HttpClient } from "./HttpClient"
import { dataUrlToBlob } from "@/utils/dataUrl"
import { notifyDataChanged } from "@/utils/syncNotifier"

export class MemberManager {
  private httpClient: HttpClient
  private apiEndpoints: Record<string, string>

  constructor(httpClient: HttpClient, apiEndpoints: Record<string, string>) {
    this.httpClient = httpClient
    this.apiEndpoints = apiEndpoints
  }

  async getMembers(): Promise<AttendanceMember[]> {
    try {
      const members = await this.httpClient.get<AttendanceMember[]>(this.apiEndpoints.members)
      return members.map((member) => ({
        ...member,
        joined_at: new Date(member.joined_at),
      }))
    } catch (error) {
      console.error("Error getting members:", error)
      return []
    }
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
    const memberData: {
      group_id: string
      name: string
      role?: string
      email?: string
      person_id?: string
    } = {
      group_id: groupId,
      name,
      role: options?.role,
      email: options?.email,
    }

    if (options?.personId) {
      memberData.person_id = options.personId
    }

    const member = await this.httpClient.post<AttendanceMember>(
      this.apiEndpoints.members,
      memberData,
    )
    notifyDataChanged()
    return {
      ...member,
      joined_at: new Date(member.joined_at),
    }
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
    const payload = {
      members: members.map((m) => ({
        group_id: groupId,
        name: m.name,
        role: m.role || undefined,
        email: m.email || undefined,
        person_id: m.personId || undefined,
      })),
    }

    const res = await this.httpClient.post<{
      success_count: number
      error_count: number
      errors: Array<{ person_id: string; error: string }>
      members: AttendanceMember[]
    }>(`${this.apiEndpoints.members}/bulk`, payload)

    notifyDataChanged()

    return {
      ...res,
      members: (res.members || []).map((m) => ({
        ...m,
        joined_at: new Date(m.joined_at),
      })),
    }
  }

  async getMember(personId: string): Promise<AttendanceMember | undefined> {
    try {
      const member = await this.httpClient.get<AttendanceMember>(
        `${this.apiEndpoints.members}/${personId}`,
      )
      return {
        ...member,
        joined_at: new Date(member.joined_at),
      }
    } catch {
      return undefined
    }
  }

  async updateMember(personId: string, updates: Partial<AttendanceMember>): Promise<boolean> {
    try {
      await this.httpClient.put<AttendanceMember>(
        `${this.apiEndpoints.members}/${personId}`,
        updates,
      )
      notifyDataChanged()
      return true
    } catch (error) {
      console.error("Error updating member:", error)
      return false
    }
  }

  async removeMembersBulk(personIds: string[]): Promise<{
    success_count: number
    error_count: number
    errors: Array<{ person_id: string; error: string }>
  }> {
    const res = await this.httpClient.post<{
      success_count: number
      error_count: number
      errors: Array<{ person_id: string; error: string }>
    }>(`${this.apiEndpoints.members}/bulk-delete`, { person_ids: personIds })
    notifyDataChanged()
    return res
  }

  async removeMember(personId: string): Promise<boolean> {
    try {
      await this.httpClient.delete(`${this.apiEndpoints.members}/${personId}`)
      notifyDataChanged()
      return true
    } catch (error) {
      console.error("Error removing member:", error)
      return false
    }
  }

  async enrollFaceForGroupPerson(
    groupId: string,
    personId: string,
    imageData: Blob | string,
    bbox: number[],
    landmarks_5: number[][],
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      let imageBlob: Blob
      if (typeof imageData === "string") {
        const dataUrl =
          imageData.startsWith("data:") ? imageData : `data:image/jpeg;base64,${imageData}`
        imageBlob = dataUrlToBlob(dataUrl)
      } else {
        imageBlob = imageData
      }

      const formData = new FormData()
      formData.append("image", imageBlob, "face.jpg")
      formData.append(
        "metadata",
        JSON.stringify({
          bbox,
          landmarks_5,
        }),
      )

      const url = `${this.apiEndpoints.groups}/${groupId}/persons/${personId}/enroll-face`
      const result = await this.httpClient.postMultipart<{
        success: boolean
        message: string
      }>(url, formData)

      notifyDataChanged()
      return { success: true, message: result.message }
    } catch (error) {
      console.error("Error enrolling face for group person:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to enroll member",
      }
    }
  }

  async removeFaceDataForGroupPerson(
    groupId: string,
    personId: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const result = await this.httpClient.delete<{
        success: boolean
        message: string
      }>(`${this.apiEndpoints.groups}/${groupId}/persons/${personId}/face-data`)
      notifyDataChanged()
      return { success: true, message: result.message }
    } catch (error) {
      console.error("Error removing face data for group person:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove face data",
      }
    }
  }
}
