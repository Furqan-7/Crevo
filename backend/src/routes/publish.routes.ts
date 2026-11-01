import { Router } from "express";
import * as publish from "../controllers/publish.controller";
import { aiLimit } from "../middleware/limits";
import { validate } from "../middleware/validate";
import { idParam } from "../schemas/common";
import { createUploadBody, captionParams, listPostsQuery, listVideosQuery, scheduleClipBody, updateCaptionBody, updateClipBody } from "../schemas/publish";

export const videosRouter = Router();

videosRouter.get("/", validate({ query: listVideosQuery }), publish.listVideos);
videosRouter.post("/uploads", validate({ body: createUploadBody }), publish.createUpload);
videosRouter.get("/:id", validate({ params: idParam }), publish.getVideo);
videosRouter.post("/:id/process", validate({ params: idParam }), publish.processVideo);

export const clipsRouter = Router();

clipsRouter.patch("/:id", validate({ params: idParam, body: updateClipBody }), publish.updateClip);
clipsRouter.patch("/:id/captions/:platform", validate({ params: captionParams, body: updateCaptionBody }), publish.updateCaption);
clipsRouter.post("/:id/captions/:platform/rewrite", aiLimit, validate({ params: captionParams }), publish.rewriteCaption);
clipsRouter.post("/:id/schedule", validate({ params: idParam, body: scheduleClipBody }), publish.scheduleClip);

export const postsRouter = Router();

postsRouter.get("/", validate({ query: listPostsQuery }), publish.listPosts);
postsRouter.get("/:id/download", validate({ params: idParam }), publish.downloadClip);
