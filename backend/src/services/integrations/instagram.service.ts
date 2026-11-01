import { prisma } from "db";
import { badRequest } from "../../utils/AppError";

// Instagram has no API for personal creator accounts, so its daily metrics
// come from a CSV export (Meta Business Suite › Insights › Export, or any
// sheet with a date column and views and/or followers columns).

// A small RFC 4180 parser: quoted fields, escaped quotes, CRLF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

// "2026-10-28", "10/28/2026", "28/10/2026", "Oct 28, 2026" → ISO date.
export function parseDate(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) {
    // Day first when the first number can't be a month.
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [month, day] = a > 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const t = Date.parse(`${v} UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export async function importInstagramCsv(userId: string, csv: string, fileName: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw badRequest("That CSV has no rows.", "CSV_EMPTY");
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (patterns: RegExp[]) => head.findIndex((h) => patterns.some((p) => p.test(h)));
  const dateCol = col([/^date$/, /^day$/, /date/]);
  const viewsCol = col([/^views$/, /plays/, /views/, /reach/, /impressions/]);
  const followersCol = col([/follows/, /followers gained/, /new followers/, /^followers$/, /followers/]);
  if (dateCol < 0 || (viewsCol < 0 && followersCol < 0)) {
    throw badRequest("The CSV needs a date column and a views or followers column.", "CSV_COLUMNS");
  }

  let imported = 0;
  for (const r of rows.slice(1)) {
    const date = parseDate(r[dateCol] ?? "");
    if (!date) continue;
    const views = viewsCol >= 0 ? num(r[viewsCol]) : null;
    const followers = followersCol >= 0 ? num(r[followersCol]) : null;
    if (views === null && followers === null) continue;
    const day = new Date(`${date}T00:00:00.000Z`);
    await prisma.channelDay.upsert({
      where: { profileId_channel_date: { profileId: userId, channel: "instagram", date: day } },
      create: { profileId: userId, channel: "instagram", date: day, views: views ?? 0, followers: followers ?? 0 },
      update: { ...(views !== null ? { views } : {}), ...(followers !== null ? { followers } : {}) },
    });
    imported++;
  }
  if (imported === 0) throw badRequest("No rows had a date we could read.", "CSV_NO_ROWS");
  await prisma.connectedAccount.upsert({
    where: { profileId_provider: { profileId: userId, provider: "instagram" } },
    create: { profileId: userId, provider: "instagram", status: "imported", syncedAt: new Date(), externalId: fileName.slice(0, 200) },
    update: { status: "imported", syncedAt: new Date(), lastError: null, externalId: fileName.slice(0, 200) },
  });
  return { imported };
}
