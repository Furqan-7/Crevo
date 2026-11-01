import { prisma, type Prisma } from "db";
import type { ApproveMessagesInput, ListMessagesQuery, UpdateMessageInput } from "../schemas/messages";
import type { MessageDto } from "../types/api";
import { badRequest, notFound } from "../utils/AppError";
import { enqueue } from "../jobs/queue";
import { messageInclude, toMessageDto } from "./mappers";
import { indexSource } from "./rag.service";

export async function listMessages(userId: string, query: ListMessagesQuery) {
  const where: Prisma.MessageWhereInput = {
    profileId: userId,
    archivedAt: query.archived ? { not: null } : null,
    category: query.category,
    ...(query.q
      ? {
          OR: [
            { fromName: { contains: query.q, mode: "insensitive" } },
            { subject: { contains: query.q, mode: "insensitive" } },
            { preview: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      include: messageInclude,
      orderBy: { receivedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.message.count({ where }),
  ]);
  return { messages: rows.map(toMessageDto), total };
}

export async function updateMessage(userId: string, id: string, input: UpdateMessageInput): Promise<MessageDto> {
  const now = new Date();
  const data: Prisma.MessageUpdateInput = {};
  if (input.read !== undefined) data.readAt = input.read ? now : null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? now : null;
  if (input.tone !== undefined) data.tone = input.tone;
  if (input.draftRequested) data.draftRequested = true;
  if (input.editedReply !== undefined) data.editedReply = input.editedReply;

  // Scoping the update by profileId makes another user's message a 404.
  const message = await prisma.message.update({ where: { id, profileId: userId }, data, include: messageInclude });
  return toMessageDto(message);
}

// Approves replies (saving the text the creator approved). Already-approved
// messages are left as they were, so approving twice is harmless.
export async function approveMessages(userId: string, input: ApproveMessagesInput): Promise<MessageDto[]> {
  const ids = [...new Set(input.items.map((item) => item.id))];
  const owned = await prisma.message.findMany({ where: { id: { in: ids }, profileId: userId }, select: { id: true, category: true, approvedAt: true, source: true, externalId: true, subject: true } });
  if (owned.length !== ids.length) throw notFound("Message");
  if (owned.some((m) => m.category === "spam")) throw badRequest("Spam doesn't need a reply", "SPAM_REPLY");

  const pending = new Set(owned.filter((m) => m.approvedAt === null).map((m) => m.id));
  const now = new Date();
  await prisma.$transaction(
    input.items
      .filter((item) => pending.has(item.id))
      .map((item) =>
        prisma.message.update({
          where: { id: item.id, profileId: userId },
          data: { approvedAt: now, approvedReply: item.text, readAt: now },
        }),
      ),
  );
  // Deliver the new approvals (Gmail draft / YouTube reply) in the
  // background, and keep each approved reply for search: future drafts
  // learn the creator's voice from them.
  for (const item of input.items.filter((i) => pending.has(i.id))) {
    const m = owned.find((o) => o.id === item.id)!;
    await indexSource(userId, "reply", m.id, `Reply to "${m.subject}":\n${item.text}`);
    if (m.externalId && m.source === "gmail") await enqueue("gmail.draft", { messageId: m.id }, { profileId: userId, key: `gmail.draft:${m.id}` });
    if (m.externalId && m.source === "youtube") await enqueue("youtube.reply", { messageId: m.id }, { profileId: userId, key: `youtube.reply:${m.id}` });
  }
  const rows = await prisma.message.findMany({ where: { id: { in: ids }, profileId: userId }, include: messageInclude });
  return rows.map(toMessageDto);
}
