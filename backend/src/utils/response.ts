import type { Response } from "express";
import type { Pagination } from "../types/api";

export function sendSuccess<T>(res: Response, data: T, message: string, status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function sendList<T>(res: Response, data: T[], pagination: Pagination, message: string) {
  return res.status(200).json({ success: true, message, data, pagination });
}

export function paginate(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
