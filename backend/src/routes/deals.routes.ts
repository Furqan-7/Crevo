import { Router } from "express";
import * as deals from "../controllers/deals.controller";
import { validate } from "../middleware/validate";
import { slugParam } from "../schemas/common";
import { createDealBody, deliverableParams, listDealsQuery, updateDealBody, updateDeliverableBody } from "../schemas/deals";

export const dealsRouter = Router();

dealsRouter.get("/", validate({ query: listDealsQuery }), deals.listDeals);
dealsRouter.post("/", validate({ body: createDealBody }), deals.createDeal);
dealsRouter.get("/:slug", validate({ params: slugParam }), deals.getDeal);
dealsRouter.patch("/:slug", validate({ params: slugParam, body: updateDealBody }), deals.updateDeal);
dealsRouter.patch("/:slug/deliverables/:deliverableId", validate({ params: deliverableParams, body: updateDeliverableBody }), deals.updateDeliverable);
