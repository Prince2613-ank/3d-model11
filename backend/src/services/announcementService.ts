import { announcementRepository } from "../repositories/announcementRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { Announcement, AnnouncementCategory, AuthenticatedUser } from "../types/domain";
import { NotFoundError } from "../errors";


export interface AnnouncementInput {
  title: string;
  body: string;
  category: AnnouncementCategory;
  startsAt?: string | null;
  endsAt?: string | null;
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
      })
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

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "announcement_updated",
      entityType: "announcement",
      entityId: id,
      metadata: input
    });

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

