import { Router } from "express";
import * as messages from "../controllers/messages.controller";
import { aiLimit } from "../middleware/limits";
import { validate } from "../middleware/validate";
import { idParam } from "../schemas/common";
import { approveMessagesBody, listMessagesQuery, updateMessageBody } from "../schemas/messages";

export const messagesRouter = Router();

messagesRouter.get("/", validate({ query: listMessagesQuery }), messages.listMessages);
messagesRouter.post("/approve", validate({ body: approveMessagesBody }), messages.approveMessages);
messagesRouter.patch("/:id", validate({ params: idParam, body: updateMessageBody }), messages.updateMessage);
messagesRouter.post("/:id/drafts", aiLimit, validate({ params: idParam }), messages.draftReply);
