// A suspension is a disabled account with a future `suspendedUntil`; the disable
// is lifted automatically once that time passes so the student can use the app
// again. A permanent disable (a "dismiss") is `disabled` with no `suspendedUntil`
// and stays that way until an admin re-enables it.

export const isSuspended = (user) =>
  user?.status === 'disabled' && Boolean(user?.suspendedUntil) && new Date(user.suspendedUntil).getTime() > Date.now();

export const suspensionExpired = (user) =>
  user?.status === 'disabled' && Boolean(user?.suspendedUntil) && new Date(user.suspendedUntil).getTime() <= Date.now();

// Persist the lift. Returns true when the account is now usable.
export async function liftIfExpired(user) {
  if (!suspensionExpired(user)) return false;
  user.status = 'active';
  user.suspendedUntil = null;
  await user.save({ validateModifiedOnly: true });
  return true;
}
