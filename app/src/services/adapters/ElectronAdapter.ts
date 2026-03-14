import type {
  PersonRemovalResponse,
  PersonUpdateResponse,
  SimilarityThresholdResponse,
  DatabaseStatsResponse,
  PersonInfo,
} from "../../types/recognition"

export class ElectronAdapter {
  async removePerson(personId: string): Promise<PersonRemovalResponse> {
    return window.electronAPI.backend.removePerson(personId)
  }

  async updatePerson(oldPersonId: string, newPersonId: string): Promise<PersonUpdateResponse> {
    return window.electronAPI.backend.updatePerson(oldPersonId, newPersonId)
  }

  async getAllPersons(): Promise<{ persons: PersonInfo[] }> {
    return window.electronAPI.backend.getAllPersons()
  }

  async setThreshold(threshold: number): Promise<SimilarityThresholdResponse> {
    return window.electronAPI.backend.setThreshold(threshold)
  }

  async clearDatabase(): Promise<{ success: boolean; message: string }> {
    return window.electronAPI.backend.clearDatabase()
  }

  async getFaceStats(): Promise<DatabaseStatsResponse> {
    return window.electronAPI.backend.getFaceStats()
  }
}
