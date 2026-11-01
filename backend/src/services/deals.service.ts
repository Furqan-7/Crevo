import { randomBytes } from "crypto";
import { prisma, type Prisma } from "db";
import type { CreateDealInput, UpdateDealInput } from "../schemas/deals";
import type { DealDto, DealStage } from "../types/api";
import { notFound } from "../utils/AppError";
import { fromIsoDate } from "../utils/dates";
import { PAYMENT_LABEL, assessContract, deliverableItems } from "./dealHealth";
import { clockFor } from "./clock.service";
import { pushCalendar } from "./events.service";
import { dealInclude, toDealDto } from "./mappers";

// Deals added from a contract all get the same brand colour; the sample
// deals carry their brand's own.
const NEW_DEAL_COLOR = "#5a52c7";

export async function listDeals(userId: string, stage?: DealStage): Promise<DealDto[]> {
  const rows = await prisma.deal.findMany({ where: { profileId: userId, stage }, include: dealInclude, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  return rows.map(toDealDto);
}

export async function getDeal(userId: string, slug: string): Promise<DealDto> {
  const deal = await prisma.deal.findUnique({ where: { profileId_slug: { profileId: userId, slug } }, include: dealInclude });
  if (!deal) throw notFound("Deal");
  return toDealDto(deal);
}

function slugFor(brand: string) {
  const base = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deal";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

// Turns the terms read from a contract into a deal, scoring it on the
// server so the client can't send its own health or risks.
export async function createDeal(userId: string, input: CreateDealInput): Promise<DealDto> {
  const { health, risks } = assessContract(input, (await clockFor(userId)).today);
  const fee = `$${input.fee.toLocaleString("en-US")}`;
  const data: Prisma.DealCreateInput = {
    profile: { connect: { id: userId } },
    slug: slugFor(input.brand),
    brand: input.brand,
    color: NEW_DEAL_COLOR,
    campaign: input.campaign,
    stage: input.stage,
    amount: input.fee,
    dueDate: fromIsoDate(input.due),
    source: `from ${input.fileName}`,
    alertText: risks.length ? `${risks.length} ${risks.length === 1 ? "risk" : "risks"} to fix` : null,
    alertTone: risks.length ? "warn" : null,
    healthFinancial: health.financial,
    healthDeadline: health.deadline,
    healthContract: health.contract,
    healthScope: health.scope,
    terms: {
      create: [
        { position: 0, label: "Fee", value: fee, clause: input.clauses?.fee ?? null },
        { position: 1, label: "Deliverables", value: input.deliverables, clause: input.clauses?.deliverables ?? null },
        { position: 2, label: "Usage rights", value: `${input.usageDays} days${input.usagePaid ? ", paid" : ""}`, clause: input.clauses?.usageDays ?? null },
        { position: 3, label: "Payment terms", value: PAYMENT_LABEL[input.payment], clause: input.clauses?.payment ?? null, missing: input.payment === "missing" },
      ],
    },
    risks: { create: risks.map((r, position) => ({ position, title: r.title, fix: r.fix })) },
    deliverables: { create: deliverableItems(input.deliverables).map((title, position) => ({ position, title, dueDate: fromIsoDate(input.due) })) },
  };
  if (input.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: input.documentId, profileId: userId }, select: { id: true } });
    if (!doc) throw notFound("Contract");
    data.documents = { connect: { id: doc.id } };
  }
  const deal = await prisma.deal.create({ data, include: dealInclude });
  return toDealDto(deal);
}

export async function updateDeal(userId: string, slug: string, input: UpdateDealInput): Promise<DealDto> {
  const deal = await prisma.deal.update({
    where: { profileId_slug: { profileId: userId, slug } },
    data: {
      inCalendar: input.inCalendar,
      stage: input.stage,
      paidAt: input.stage === "paid" ? new Date() : undefined,
    },
    include: dealInclude,
  });
  if (input.inCalendar) await pushCalendar(userId);
  return toDealDto(deal);
}

export async function setDeliverableDone(userId: string, slug: string, deliverableId: string, done: boolean): Promise<DealDto> {
  // The deliverable must belong to this deal, and the deal to this user.
  const result = await prisma.deliverable.updateMany({
    where: { id: deliverableId, deal: { slug, profileId: userId } },
    data: { done },
  });
  if (result.count === 0) throw notFound("Deliverable");
  return getDeal(userId, slug);
}
