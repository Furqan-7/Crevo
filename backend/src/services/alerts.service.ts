import { prisma } from "db";
import type { AlertDto } from "../types/api";
import { alertInclude, toAlertDto } from "./mappers";

export async function listAlerts(userId: string): Promise<AlertDto[]> {
  const rows = await prisma.alert.findMany({ where: { profileId: userId }, include: alertInclude, orderBy: { createdAt: "desc" } });
  return rows.map(toAlertDto);
}

// Ids that aren't this user's are ignored rather than reported, so the
// response never reveals whether someone else's alert exists.
export async function markAlertsRead(userId: string, ids: string[]): Promise<AlertDto[]> {
  await prisma.alert.updateMany({ where: { id: { in: ids }, profileId: userId, readAt: null }, data: { readAt: new Date() } });
  return listAlerts(userId);
}
