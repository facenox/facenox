import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AddMember } from "./AddMember"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"

vi.mock("@/services", () => ({
  attendanceManager: {
    addMember: vi.fn(),
    addMembersBulk: vi.fn(),
    enrollFaceForGroupPerson: vi.fn(),
  },
  backendService: {
    detectFaces: vi.fn(),
  },
  persistentSettings: {
    getUIState: vi.fn().mockResolvedValue({}),
    setUIState: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/components/group/sections/enrollment/hooks/useCamera", () => ({
  useCamera: () => ({
    videoRef: { current: null },
    cameraDevices: [],
    selectedCamera: "",
    setSelectedCamera: vi.fn(),
    isStreaming: false,
    isVideoReady: false,
    cameraError: null,
    startCamera: vi.fn().mockResolvedValue(undefined),
    stopCamera: vi.fn(),
  }),
}))

const mockGroup: AttendanceGroup = {
  id: "group-1",
  name: "Grade 10 - Rizal",
  description: "Section Rizal",
  created_at: "2026-10-08T00:00:00Z",
  member_count: 0,
  settings: {
    biometric_consent_certified: true,
  },
}

describe("AddMember Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders Name, Role, Face Biometrics section, and action buttons in Single mode", () => {
    render(
      <AddMember
        isOpen={true}
        group={mockGroup}
        existingMembers={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText("Add Members")).toBeInTheDocument()
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Face Biometrics")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Save & Add Next/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Add Member/i })).toBeInTheDocument()
  })

  it("supports 'Save & Add Next' by adding member, keeping modal open, and resetting form", async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()

    const mockCreatedMember = {
      id: "mem-1",
      person_id: "person-1",
      name: "Juan Dela Cruz",
      role: "Student",
      group_id: "group-1",
      joined_at: new Date().toISOString(),
      is_active: true,
      has_consent: true,
      has_face_data: false,
    }

    vi.mocked(attendanceManager.addMember).mockResolvedValueOnce(mockCreatedMember as any)

    render(
      <AddMember
        isOpen={true}
        group={mockGroup}
        existingMembers={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const inputs = screen.getAllByRole("textbox")
    const nameInput = inputs[0]
    const roleInput = inputs[1]

    fireEvent.change(nameInput, { target: { value: "Juan Dela Cruz" } })
    fireEvent.change(roleInput, { target: { value: "Student" } })

    const saveAndAddNextBtn = screen.getByRole("button", { name: /Save & Add Next/i })
    fireEvent.click(saveAndAddNextBtn)

    await waitFor(() => {
      expect(attendanceManager.addMember).toHaveBeenCalledWith("group-1", "Juan Dela Cruz", {
        role: "Student",
        hasConsent: true,
      })
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByText(/Juan Dela Cruz added/i)).toBeInTheDocument()
    })
  })
})
