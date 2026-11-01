import { prisma } from "db";
import type { CreateIdeaInput, CreateTodoInput, UpdateTodoInput } from "../schemas/today";
import type { IdeaDto, TodoDto } from "../types/api";
import { conflict, notFound } from "../utils/AppError";
import { fromIsoDate } from "../utils/dates";
import { ideaInclude, toIdeaDto, toTodoDto } from "./mappers";

export async function listTodos(userId: string): Promise<TodoDto[]> {
  const rows = await prisma.todo.findMany({
    where: { profileId: userId },
    orderBy: [{ dueDate: "asc" }, { dueMinutes: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return rows.map(toTodoDto);
}

export async function createTodo(userId: string, input: CreateTodoInput): Promise<TodoDto> {
  if (input.ideaId) {
    const idea = await prisma.idea.findFirst({ where: { id: input.ideaId, profileId: userId }, include: ideaInclude });
    if (!idea) throw notFound("Idea");
    if (idea.todo) throw conflict("That idea is already on your to-do list", "IDEA_ALREADY_ADDED");
  }
  const todo = await prisma.todo.create({
    data: {
      profileId: userId,
      ideaId: input.ideaId,
      title: input.title,
      detail: input.detail,
      dueDate: fromIsoDate(input.dueDate),
      dueMinutes: input.dueMinutes,
    },
  });
  return toTodoDto(todo);
}

export async function updateTodo(userId: string, id: string, input: UpdateTodoInput): Promise<TodoDto> {
  const todo = await prisma.todo.update({ where: { id, profileId: userId }, data: input });
  return toTodoDto(todo);
}

export async function deleteTodo(userId: string, id: string) {
  await prisma.todo.delete({ where: { id, profileId: userId } });
}

export async function listIdeas(userId: string): Promise<IdeaDto[]> {
  const rows = await prisma.idea.findMany({ where: { profileId: userId }, include: ideaInclude, orderBy: { createdAt: "asc" } });
  return rows.map(toIdeaDto);
}

export async function createIdea(userId: string, input: CreateIdeaInput): Promise<IdeaDto> {
  const idea = await prisma.idea.create({ data: { profileId: userId, title: input.title, why: input.why, platforms: [...new Set(input.platforms)] }, include: ideaInclude });
  return toIdeaDto(idea);
}
