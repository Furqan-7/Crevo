import type { Request, Response } from "express";
import type { ApproveMessagesInput, ListMessagesQuery, UpdateMessageInput } from "../schemas/messages";
import * as messagesService from "../services/messages.service";
import { writeDrafts } from "../services/drafts.service";
import { getSummary } from "../services/summary.service";
import { paginate, sendList, sendSuccess } from "../utils/response";

export async function listMessages(req: Request, res: Response) {
  const query = res.locals.query as ListMessagesQuery;
  const { messages, total } = await messagesService.listMessages(res.locals.userId, query);
  sendList(res, messages, paginate(query.page, query.limit, total), "Messages fetched");
}

export async function updateMessage(req: Request, res: Response) {
  const message = await messagesService.updateMessage(res.locals.userId, req.params.id as string, req.body as UpdateMessageInput);
  sendSuccess(res, message, "Message updated");
}

// Returns the approved messages and the new time-saved total together, so
// the badge updates without another request.
export async function approveMessages(req: Request, res: Response) {
  const messages = await messagesService.approveMessages(res.locals.userId, req.body as ApproveMessagesInput);
  const summary = await getSummary(res.locals.userId);
  sendSuccess(res, { messages, summary }, messages.length === 1 ? "Reply approved" : "Replies approved");
}

// Writes (or rewrites) the reply in all three tones with AI.
export async function draftReply(req: Request, res: Response) {
  sendSuccess(res, await writeDrafts(res.locals.userId, req.params.id as string), "Reply drafted");
}
