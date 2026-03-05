import type { AttendanceGroup } from "@/types/recognition";

export type GroupSection =
  | "overview"
  | "members"
  | "reports"
  | "registration"
  | "settings";

export interface GroupPanelProps {
  onBack: () => void;
  initialSection?: GroupSection;
  initialGroup?: AttendanceGroup | null; // Pre-select this group when GroupPanel opens
  onGroupsChanged?: (newGroup?: AttendanceGroup) => void; // Callback when groups are created/deleted, optionally with newly created group
  isEmbedded?: boolean; // Whether GroupPanel is embedded in Settings or standalone
  triggerCreateGroup?: number; // When set to a timestamp, opens create group modal
  deselectMemberTrigger?: number; // When this changes, deselect the member in FaceCapture
  onHasSelectedMemberChange?: (hasSelectedMember: boolean) => void; // Callback when member selection changes
  onDaysTrackedChange?: (daysTracked: number, loading: boolean) => void; // Callback when days tracked changes in Reports
  onExportHandlersReady?: (handlers: {
    exportCSV: () => void;
    print: () => void;
  }) => void; // Callback when export handlers are ready in Reports
  onAddMemberHandlerReady?: (handler: () => void) => void; // Callback when add member handler is ready
  onSectionChange?: (section: GroupSection) => void; // Callback when active section changes (for syncing with parent)
}
