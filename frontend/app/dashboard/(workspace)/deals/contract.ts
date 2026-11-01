// The terms read from a contract, the live Deal Health preview while the
// creator checks them, and the request that adds the deal.

import type { ContractReadDto, ContractTermsInput } from "@api-types";
import { HEALTH_MAX, TODAY_ISO, addDays, parseIso, type DealStage } from "../../data";
import { STAGE_CODE } from "../../_shell/model";

export interface ContractTerms {
  brand: string;
  campaign: string;
  fee: number;
  deliverables: string;
  due: string; // ISO date
  usageDays: number;
  usagePaid: boolean;
  payment: "Net 15" | "Net 30" | "Net 45" | "Net 60" | "Missing";
  revisions: "1 round" | "2 rounds" | "Unlimited";
  stage: Exclude<DealStage, "Paid">;
}

const PAYMENT_CODE: Record<ContractTerms["payment"], ContractTermsInput["payment"]> = { "Net 15": "net_15", "Net 30": "net_30", "Net 45": "net_45", "Net 60": "net_60", Missing: "missing" };
const REVISIONS_CODE: Record<ContractTerms["revisions"], ContractTermsInput["revisions"]> = { "1 round": "one", "2 rounds": "two", Unlimited: "unlimited" };

// The sample contract's terms (for "Use a sample contract"); every field is
// editable before the deal is added. Due a month from today.
export const sampleTerms = (): ContractTerms => ({
  brand: "Sony",
  campaign: "Alpha creator series",
  fee: 2800,
  deliverables: "1 YouTube video, 2 Shorts",
  due: addDays(TODAY_ISO, 30),
  usageDays: 90,
  usagePaid: false,
  payment: "Net 60",
  revisions: "Unlimited",
  stage: "New offer",
});

// The clauses the sample was read from, shown next to each term.
export const SAMPLE_CLAUSES: Partial<Record<keyof ContractTerms, string>> = {
  fee: "§5.1",
  deliverables: "§3",
  due: "§3.4",
  usageDays: "§8",
  payment: "§6",
  revisions: "§4.2",
};

export function assess(t: ContractTerms) {
  const daysLeft = Math.round((parseIso(t.due).getTime() - parseIso(TODAY_ISO).getTime()) / 86_400_000);
  const items = t.deliverables.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean);
  const paymentPts = { "Net 15": 15, "Net 30": 15, "Net 45": 10, "Net 60": 6, Missing: 0 }[t.payment];
  const freeUsage = t.usageDays > 30 && !t.usagePaid;

  const health = {
    financial: Math.min(HEALTH_MAX.financial, (t.fee >= 2000 ? 10 : t.fee >= 1000 ? 7 : 4) + paymentPts),
    deadline: daysLeft >= 21 ? 25 : daysLeft >= 10 ? 18 : daysLeft >= 0 ? 10 : 4,
    contract: Math.max(0, HEALTH_MAX.contract - (t.revisions === "Unlimited" ? 10 : 0) - (freeUsage ? 8 : 0) - (t.payment === "Missing" ? 6 : 0)),
    scope: items.length <= 3 ? 17 : 12,
  };

  const risks: { title: string; fix: string }[] = [];
  if (t.payment === "Missing") risks.push({ title: "No payment terms", fix: "Ask for Net 30 in writing." });
  else if (t.payment === "Net 60" || t.payment === "Net 45") risks.push({ title: `${t.payment} payment`, fix: "Ask for Net 30." });
  if (t.revisions === "Unlimited") risks.push({ title: "Unlimited revisions", fix: "Cap at 2 rounds." });
  if (freeUsage) risks.push({ title: "Free usage rights", fix: `Add a fee for ${t.usageDays} days of paid use.` });
  if (daysLeft < 10) risks.push({ title: "Tight deadline", fix: "Ask for at least two weeks." });

  return { health, risks, items, daysLeft, score: health.financial + health.deadline + health.contract + health.scope };
}

// The reviewed terms in the API's shape. The API scores the deal itself
// (the same rules as assess(), which only previews the score here).
export function toContractInput(t: ContractTerms, fileName: string, read?: { documentId: string; clauses: Clauses }): ContractTermsInput {
  return {
    brand: t.brand.trim(),
    campaign: t.campaign.trim(),
    fee: t.fee,
    deliverables: t.deliverables.trim(),
    due: t.due,
    usageDays: t.usageDays,
    usagePaid: t.usagePaid,
    payment: PAYMENT_CODE[t.payment],
    revisions: REVISIONS_CODE[t.revisions],
    stage: STAGE_CODE[t.stage] as ContractTermsInput["stage"],
    fileName,
    ...(read ? { documentId: read.documentId, clauses: { fee: read.clauses.fee ?? null, deliverables: read.clauses.deliverables ?? null, usageDays: read.clauses.usageDays ?? null, payment: read.clauses.payment ?? null } } : {}),
  };
}

export type Clauses = Partial<Record<keyof ContractTerms, string | null>>;

const PAYMENT_LABEL = Object.fromEntries(Object.entries(PAYMENT_CODE).map(([k, v]) => [v, k])) as Record<ContractTermsInput["payment"], ContractTerms["payment"]>;
const REVISIONS_LABEL = Object.fromEntries(Object.entries(REVISIONS_CODE).map(([k, v]) => [v, k])) as Record<ContractTermsInput["revisions"], ContractTerms["revisions"]>;

// What the API read from an uploaded contract, as the form's values.
export function fromContractRead(read: ContractReadDto): { terms: ContractTerms; clauses: Clauses } {
  const t = read.terms;
  return {
    terms: { brand: t.brand, campaign: t.campaign, fee: t.fee, deliverables: t.deliverables, due: t.due, usageDays: t.usageDays, usagePaid: t.usagePaid, payment: PAYMENT_LABEL[t.payment], revisions: REVISIONS_LABEL[t.revisions], stage: "New offer" },
    clauses: t.clauses,
  };
}
