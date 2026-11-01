import { prisma } from "db";
import { features } from "../config/env";
import { revoke } from "../lib/google";
import { removePrefix, supabaseAdmin } from "../lib/storage";
import { errorMessage, logger } from "../utils/logger";

// Deletes the account for good: uploaded files, the Google grant, every
// workspace row (all cascade from Profile) and the Supabase login itself.
export async function deleteAccount(userId: string): Promise<{ loginDeleted: boolean }> {
  if (features.storage) {
    await removePrefix(`${userId}/`).catch((err: unknown) => logger.warn("storage cleanup failed", { userId, error: errorMessage(err) }));
  }
  await revoke(userId).catch((err: unknown) => logger.warn("google revoke failed", { userId, error: errorMessage(err) }));
  await prisma.profile.deleteMany({ where: { id: userId } });

  if (!features.storage) return { loginDeleted: false };
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
  if (error) {
    logger.error("supabase user delete failed", { userId, error: error.message });
    return { loginDeleted: false };
  }
  return { loginDeleted: true };
}
