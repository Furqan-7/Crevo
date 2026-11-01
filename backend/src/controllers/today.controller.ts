import type { Request, Response } from "express";
import type { CreateIdeaInput, CreateTodoInput, UpdateTodoInput } from "../schemas/today";
import * as todayService from "../services/today.service";
import { getSummary } from "../services/summary.service";
import { sendSuccess } from "../utils/response";

export async function listTodos(req: Request, res: Response) {
  sendSuccess(res, await todayService.listTodos(res.locals.userId), "To-dos fetched");
}

export async function createTodo(req: Request, res: Response) {
  sendSuccess(res, await todayService.createTodo(res.locals.userId, req.body as CreateTodoInput), "To-do added", 201);
}

export async function updateTodo(req: Request, res: Response) {
  sendSuccess(res, await todayService.updateTodo(res.locals.userId, req.params.id as string, req.body as UpdateTodoInput), "To-do updated");
}

export async function deleteTodo(req: Request, res: Response) {
  await todayService.deleteTodo(res.locals.userId, req.params.id as string);
  res.status(204).end();
}

export async function listIdeas(req: Request, res: Response) {
  sendSuccess(res, await todayService.listIdeas(res.locals.userId), "Ideas fetched");
}

export async function createIdea(req: Request, res: Response) {
  sendSuccess(res, await todayService.createIdea(res.locals.userId, req.body as CreateIdeaInput), "Idea added", 201);
}

export async function summary(req: Request, res: Response) {
  sendSuccess(res, await getSummary(res.locals.userId), "Summary fetched");
}
