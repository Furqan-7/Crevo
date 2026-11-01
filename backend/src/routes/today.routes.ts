import { Router } from "express";
import * as today from "../controllers/today.controller";
import { validate } from "../middleware/validate";
import { idParam } from "../schemas/common";
import { createIdeaBody, createTodoBody, updateTodoBody } from "../schemas/today";

export const todosRouter = Router();

todosRouter.get("/", today.listTodos);
todosRouter.post("/", validate({ body: createTodoBody }), today.createTodo);
todosRouter.patch("/:id", validate({ params: idParam, body: updateTodoBody }), today.updateTodo);
todosRouter.delete("/:id", validate({ params: idParam }), today.deleteTodo);

export const ideasRouter = Router();

ideasRouter.get("/", today.listIdeas);
ideasRouter.post("/", validate({ body: createIdeaBody }), today.createIdea);
