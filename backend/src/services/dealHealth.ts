import type { CreateDealInput } from "../schemas/deals";
import type { DealHealth, DealRiskDto, PaymentTerms, Revisions } from "../types/api";
import { daysBetween } from "../utils/dates";

// The rule-based Deal Health score: up to 25 financial, 25 deadline,
// 30 contract and 20 scope points, plus the risks that cost points.

export const HEALTH_MAX: DealHealth = { financial: 25, deadline: 25, contract: 30, scope: 20 };

export const PAYMENT_LABEL: Record<PaymentTerms, string> = {
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  net_60: "Net 60",
  missing: "Missing",
};

export const REVISIONS_LABEL: Record<Revisions, string> = { one: "1 round", two: "2 rounds", unlimited: "Unlimited" };

const PAYMENT_POINTS: Record<PaymentTerms, number> = { net_15: 15, net_30: 15, net_45: 10, net_60: 6, missing: 0 };

export function deliverableItems(deliverables: string): string[] {
  return deliverables
    .split(/,|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// `today` is the creator's local date; the deadline score counts from it.
export function assessContract(t: CreateDealInput, today: string): { health: DealHealth; risks: DealRiskDto[] } {
  const daysLeft = daysBetween(today, t.due);
  const items = deliverableItems(t.deliverables);
  const freeUsage = t.usageDays > 30 && !t.usagePaid;

  const health: DealHealth = {
    financial: Math.min(HEALTH_MAX.financial, (t.fee >= 2000 ? 10 : t.fee >= 1000 ? 7 : 4) + PAYMENT_POINTS[t.payment]),
    deadline: daysLeft >= 21 ? 25 : daysLeft >= 10 ? 18 : daysLeft >= 0 ? 10 : 4,
    contract: Math.max(0, HEALTH_MAX.contract - (t.revisions === "unlimited" ? 10 : 0) - (freeUsage ? 8 : 0) - (t.payment === "missing" ? 6 : 0)),
    scope: items.length <= 3 ? 17 : 12,
  };

  const risks: DealRiskDto[] = [];
  if (t.payment === "missing") risks.push({ title: "No payment terms", fix: "Ask for Net 30 in writing." });
  else if (t.payment === "net_60" || t.payment === "net_45") risks.push({ title: `${PAYMENT_LABEL[t.payment]} payment`, fix: "Ask for Net 30." });
  if (t.revisions === "unlimited") risks.push({ title: "Unlimited revisions", fix: "Cap at 2 rounds." });
  if (freeUsage) risks.push({ title: "Free usage rights", fix: `Add a fee for ${t.usageDays} days of paid use.` });
  if (daysLeft < 10) risks.push({ title: "Tight deadline", fix: "Ask for at least two weeks." });

  return { health, risks };
}
