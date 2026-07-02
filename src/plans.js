export const PLAN_LIMITS = {
  free: { workspaces: 1, folders_per_workspace: 3 },
  plus: { workspaces: 1, folders_per_workspace: Number.MAX_SAFE_INTEGER },
  pro:  { workspaces: 10, folders_per_workspace: Number.MAX_SAFE_INTEGER },
  business: { workspaces: Number.MAX_SAFE_INTEGER, folders_per_workspace: Number.MAX_SAFE_INTEGER },
};

export function limitFor(plan) {
  const key = (plan || 'free').toLowerCase();
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}
