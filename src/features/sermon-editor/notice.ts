import type { V4Notice } from "@/features/editor-lab/v4/model";
import type { editorLab } from "@/i18n/dictionaries/en/editorLab";

type Notices = (typeof editorLab)["v4"]["notices"];

/** What the editor tells the person after a structural change with consequences, in their language. */
export function noticeText(notices: Notices, notice: V4Notice): string {
  switch (notice.code) {
    case "point_converted":
      return notices.point_converted(notice.linked);
    case "point_removed":
      return notices.point_removed;
    case "points_deleted":
      return notices.points_deleted(notice.count, notice.reparented);
    case "ownership_changed":
      return notices.ownership_changed(notice.count);
    case "role_dropped":
      return notices.role_dropped(notice.role);
    case "change_refused":
      return notices.change_refused;
  }
}
