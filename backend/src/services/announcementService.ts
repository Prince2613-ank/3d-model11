import { announcementRepository } from "../repositories/announcementRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { profileRepository } from "../repositories/profileRepository";
import { sendMail } from "../lib/mailer";
import { announcementEmail } from "../lib/emailTemplates";
import { Announcement, AnnouncementCategory, AuthenticatedUser } from "../types/domain";
import { NotFoundError } from "../errors";


export interface AnnouncementInput {
  title: string;
  body: string;
  category: AnnouncementCategory;
  startsAt?: string | null;
  endsAt?: string | null;
}

// Best-effort side channel, same rationale as complaintService's email
// helpers — a mail failure must never break publishing the announcement.
async function emailEveryoneAboutAnnouncement(kind: "new" | "updated", announcement: Announcement, admin: AuthenticatedUser): Promise<void> {
  try {
    const recipients = await profileRepository.listActiveEmails();
    if (!recipients.length) return;
    const email = announcementEmail(kind, { title: announcement.title, body: announcement.body, category: announcement.category });
    await sendMail({ bcc: recipients, replyTo: admin.email, ...email });
  } catch (err) {
    console.error(`[announcementService] Failed to email ${kind === "updated" ? "updated" : "new"} announcement:`, (err as Error).message);
  }
}

export const announcementService = {
  async listActive(): Promise<Announcement[]> {
    return announcementRepository.listActive();
  },

  async listAll(): Promise<Announcement[]> {
    return announcementRepository.list();
  },

  async create(admin: AuthenticatedUser, input: AnnouncementInput): Promise<Announcement> {
    const announcement = await announcementRepository.insert({
      title: input.title,
      body: input.body,
      category: input.category,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      created_by: admin.id
    });

    await Promise.all([
      notificationRepository.create({
        isAdminBroadcast: false,
        type: "announcement",
        title: announcement.title,
        body: announcement.body
      }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "announcement_created",
        entityType: "announcement",
        entityId: announcement.id
      }),
      emailEveryoneAboutAnnouncement("new", announcement, admin)
    ]);

    return announcement;
  },

  async update(admin: AuthenticatedUser, id: string, input: Partial<AnnouncementInput>): Promise<Announcement> {
    const columns: Record<string, unknown> = {};
    if (input.title !== undefined) columns.title = input.title;
    if (input.body !== undefined) columns.body = input.body;
    if (input.category !== undefined) columns.category = input.category;
    if (input.startsAt !== undefined) columns.starts_at = input.startsAt;
    if (input.endsAt !== undefined) columns.ends_at = input.endsAt;

    const updated = await announcementRepository.update(id, columns);
    if (!updated) throw new NotFoundError("Announcement", id);

    await Promise.all([
      // Re-broadcast on edit so anyone who already saw/dismissed the original
      // notification is alerted that its content changed (e.g. a corrected time).
      notificationRepository.create({
        isAdminBroadcast: false,
        type: "announcement",
        title: `Updated: ${updated.title}`,
        body: updated.body
      }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "announcement_updated",
        entityType: "announcement",
        entityId: id,
        metadata: input
      }),
      emailEveryoneAboutAnnouncement("updated", updated, admin)
    ]);

    return updated;
  },

  async setActive(admin: AuthenticatedUser, id: string, isActive: boolean): Promise<Announcement> {
    const updated = await announcementRepository.update(id, { is_active: isActive });
    if (!updated) throw new NotFoundError("Announcement", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: isActive ? "announcement_activated" : "announcement_deactivated",
      entityType: "announcement",
      entityId: id
    });

    return updated;
  },

  async remove(admin: AuthenticatedUser, id: string): Promise<Announcement> {
    const deleted = await announcementRepository.softDelete(id);
    if (!deleted) throw new NotFoundError("Announcement", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "announcement_deleted",
      entityType: "announcement",
      entityId: id
    });

    return deleted;
  }
};

