import { Request, Response } from "express";
import { profileRepository } from "../repositories/profileRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { ValidationError } from "../errors";
import { UserRole } from "../types/domain";

const VALID_ROLES: UserRole[] = ["user", "admin"];

export const profileController = {
  // Called by the frontend right after Google sign-in to fetch/confirm the
  // caller's profile and record the login in the activity log.
  async me(req: Request, res: Response): Promise<void> {
    const profile = await profileRepository.findById(req.user!.id);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    // req.user.role is already the allowlist-checked value (see attachUser)
    // — use it here too so a stray "admin" left in the `role` column can't
    // make the frontend render admin UI for an account that isn't allowed it.
    profile.role = req.user!.role;

    await Promise.all([
      profileRepository.touchLastLogin(req.user!.id),
      activityLogRepository.record({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: "user_login",
        entityType: "profile",
        entityId: req.user!.id
      })
    ]);

    res.json({ profile });
  },

  async list(req: Request, res: Response): Promise<void> {
    const { search, page, pageSize } = req.query;
    const limit = Math.min(parseInt((pageSize as string) ?? "50", 10) || 50, 200);
    const offset = ((parseInt((page as string) ?? "1", 10) || 1) - 1) * limit;

    const profiles = search
      ? await profileRepository.search(search as string)
      : await profileRepository.list(limit, offset);

    res.json({ profiles });
  },

  async setRole(req: Request, res: Response): Promise<void> {
    const { role } = req.body;
    if (!VALID_ROLES.includes(role)) throw new ValidationError(`role must be one of ${VALID_ROLES.join(", ")}`);

    const profile = await profileRepository.setRole(req.params.id, role);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    await activityLogRepository.record({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "user_role_changed",
      entityType: "profile",
      entityId: req.params.id,
      metadata: { role }
    });

    res.json({ profile });
  },

  async setActive(req: Request, res: Response): Promise<void> {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") throw new ValidationError("isActive must be a boolean");

    const profile = await profileRepository.setActive(req.params.id, isActive);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    await activityLogRepository.record({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: isActive ? "user_activated" : "user_deactivated",
      entityType: "profile",
      entityId: req.params.id
    });

    res.json({ profile });
  }
};
