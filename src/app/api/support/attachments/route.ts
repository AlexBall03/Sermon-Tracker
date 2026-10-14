import { after } from "next/server";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { deleteScreenshots, storeScreenshot } from "@/features/support/blob";
import { sniffImageType, supportLimits } from "@/features/support/model";
import * as tickets from "@/features/support/tickets";
import { dictionary } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { isBlobConfigured } from "@/lib/env";

const noStore = { "Cache-Control": "no-store" };

/**
 * Uploads one screenshot for a feedback message the account is writing. What
 * the file is comes from its own first bytes, never from its name or the type
 * the browser declares. It is stored privately under a name of the server's
 * choosing and belongs to the account until a ticket of theirs takes it;
 * uploads no ticket took within a day are removed here, on the account's next
 * upload, and by nothing else.
 */
export async function POST(request: Request) {
  const actor = await authorize("active");
  if (!actor.ok)
    return Response.json({ message: actor.message }, { status: 401, headers: noStore });
  const t = dictionary(await getLocale(), "support");
  const megabytes = supportLimits.attachmentBytes / (1024 * 1024);

  if (!isBlobConfigured()) {
    return Response.json({ message: t.attachments.unavailable }, { status: 503, headers: noStore });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > supportLimits.attachmentBytes + 64 * 1024) {
    return Response.json(
      { message: t.attachments.tooLarge(megabytes) },
      { status: 413, headers: noStore },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ message: t.attachments.failed }, { status: 400, headers: noStore });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ message: t.attachments.wrongType }, { status: 400, headers: noStore });
  }
  if (file.size > supportLimits.attachmentBytes) {
    return Response.json(
      { message: t.attachments.tooLarge(megabytes) },
      { status: 413, headers: noStore },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    return Response.json({ message: t.attachments.wrongType }, { status: 415, headers: noStore });
  }

  const db = getDb();
  const owner = actor.user.id;
  try {
    if ((await tickets.recentUploadCount(db, owner)) >= tickets.uploadsPerHour) {
      return Response.json({ message: t.actions.rateLimited }, { status: 429, headers: noStore });
    }
    const id = crypto.randomUUID();
    const extension = contentType.split("/")[1];
    const pathname = `support/${owner}/${id}.${extension}`;
    await storeScreenshot(pathname, bytes, contentType);
    let attachment: tickets.AttachmentView;
    try {
      attachment = await tickets.recordAttachment(db, owner, {
        id,
        pathname,
        contentType,
        size: bytes.length,
      });
    } catch (error) {
      // Stored but not recorded: nothing could ever reach it, so it goes.
      await deleteScreenshots([pathname]);
      throw error;
    }

    after(async () => {
      const orphans = await tickets.orphanedAttachments(db, owner);
      if (orphans.length === 0) return;
      if (await deleteScreenshots(orphans.map((orphan) => orphan.pathname))) {
        await tickets.deleteAttachmentRows(
          db,
          owner,
          orphans.map((orphan) => orphan.id),
        );
      }
    });

    return Response.json(
      { id: attachment.id, contentType, size: attachment.size },
      { headers: noStore },
    );
  } catch (error) {
    console.error("Screenshot upload failed:", describeDatabaseError(error));
    return Response.json({ message: t.attachments.failed }, { status: 500, headers: noStore });
  }
}
