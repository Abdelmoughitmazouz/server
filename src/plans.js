// Centralized plan limits. Update here, not at call sites.
//
// channels                = max channel slots a user may link to their account
// folders_per_workspace   = max folders for a single (user, workspace_channel_id)
//
// The folder limit is per-workspace. Free/Plus only get 1 channel slot, so the
// effective folder cap for them is 3 / unlimited respectively for that one
// channel. Pro gets 3 slots, unlimited folders in each.
//
// Channel slots are enforced on the linking flow (website), not here. This
// module checks whether a given channel_id is already in the user's
// `allowed_channels` list.
export const PLAN_LIMITS = {
  free: { channels: 1, folders_per_workspace: 3 },
  plus: { channels: 1, folders_per_workspace: Number.MAX_SAFE_INTEGER },
  pro:  { channels: 3, folders_per_workspace: Number.MAX_SAFE_INTEGER },
};

export function limitFor(plan) {
  const key = (plan || 'free').toLowerCase();
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}
