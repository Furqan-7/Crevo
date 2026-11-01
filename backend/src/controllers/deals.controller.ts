import type { Request, Response } from "express";
import type { CreateDealInput, UpdateDealInput } from "../schemas/deals";
import * as dealsService from "../services/deals.service";
import type { DealStage } from "../types/api";
import { sendSuccess } from "../utils/response";

export async function listDeals(req: Request, res: Response) {
  const { stage } = res.locals.query as { stage?: DealStage };
  sendSuccess(res, await dealsService.listDeals(res.locals.userId, stage), "Deals fetched");
}

export async function getDeal(req: Request, res: Response) {
  sendSuccess(res, await dealsService.getDeal(res.locals.userId, req.params.slug as string), "Deal fetched");
}

export async function createDeal(req: Request, res: Response) {
  const deal = await dealsService.createDeal(res.locals.userId, req.body as CreateDealInput);
  sendSuccess(res, deal, "Deal added", 201);
}

export async function updateDeal(req: Request, res: Response) {
  const deal = await dealsService.updateDeal(res.locals.userId, req.params.slug as string, req.body as UpdateDealInput);
  sendSuccess(res, deal, "Deal updated");
}

export async function updateDeliverable(req: Request, res: Response) {
  const { slug, deliverableId } = req.params as { slug: string; deliverableId: string };
  const deal = await dealsService.setDeliverableDone(res.locals.userId, slug, deliverableId, (req.body as { done: boolean }).done);
  sendSuccess(res, deal, "Deliverable updated");
}
