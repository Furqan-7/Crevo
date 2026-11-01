import { prisma, type Prisma } from "db";
import { features } from "../config/env";
import { todayIn } from "../utils/dates";
import type { CompleteOnboardingInput, UpdateProfileInput } from "../schemas/profile";
import type { AccountStatus, ProfileDto, Provider } from "../types/api";
import { enqueueEmbedding } from "./rag.service";
import { hasWorkspace, seedSampleWorkspace } from "./workspace.service";

const PROVIDERS: Provider[] = ["gmail", "calendar", "youtube", "instagram", "tiktok"];

// Until an account is connected it shows as disconnected; TikTok has no
// integration yet.
const DEFAULT_ACCOUNTS: Record<Provider, AccountStatus> = {
  gmail: "disconnected",
  calendar: "disconnected",
  youtube: "disconnected",
  instagram: "disconnected",
  tiktok: "soon",
};

const profileInclude = { accounts: true, google: { select: { googleEmail: true } } } satisfies Prisma.ProfileInclude;
type ProfileRow = Prisma.ProfileGetPayload<{ include: typeof profileInclude }>;

function toProfileDto(p: ProfileRow, workspace: boolean): ProfileDto {
  const accounts = { ...DEFAULT_ACCOUNTS };
  const sync: ProfileDto["sync"] = {};
  for (const a of p.accounts) {
    accounts[a.provider] = a.status;
    sync[a.provider] = { syncedAt: a.syncedAt?.toISOString() ?? null, lastError: a.lastError, externalId: a.externalId };
  }
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    channel: p.channel,
    niche: p.niche,
    goals: p.goals,
    briefingTime: p.briefingTime,
    briefingEmail: p.briefingEmail,
    briefingSections: p.briefingSections,
    tone: p.tone,
    signOff: p.signOff,
    autoDraft: p.autoDraft,
    notifications: p.notifications,
    accounts,
    sync,
    googleEmail: p.google?.googleEmail ?? null,
    timezone: p.timezone,
    features: { ai: features.ai, google: features.google, storage: features.storage, email: features.email },
    onboarded: p.onboardedAt !== null,
    hasWorkspace: workspace,
  };
}

// The profile row is created the first time a Supabase user calls the API.
// Its id is the Supabase user id; the email is kept in sync with the token.
export async function getOrCreateProfile(userId: string, email: string): Promise<ProfileDto> {
  const profile = await prisma.profile.upsert({
    where: { id: userId },
    create: { id: userId, email },
    update: email ? { email } : {},
    include: profileInclude,
  });
  return toProfileDto(profile, await hasWorkspace(userId));
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
  const profile = await prisma.profile.update({ where: { id: userId }, data: input, include: profileInclude });
  return toProfileDto(profile, await hasWorkspace(userId));
}

export async function setAccountStatus(userId: string, provider: Provider, status: AccountStatus): Promise<ProfileDto> {
  await prisma.connectedAccount.upsert({
    where: { profileId_provider: { profileId: userId, provider } },
    create: { profileId: userId, provider, status },
    update: { status },
  });
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, include: profileInclude });
  return toProfileDto(profile, await hasWorkspace(userId));
}

// Saves what onboarding asked for, marks it finished and, when asked and
// the workspace is still empty, fills it with the sample workspace. All in
// one transaction, so a failure leaves the account untouched.
export async function completeOnboarding(userId: string, email: string, input: CompleteOnboardingInput): Promise<ProfileDto> {
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.profile.upsert({ where: { id: userId }, create: { id: userId, email }, update: {} });
      const name = input.name ?? current.name;
      const first = name.trim().split(/\s+/)[0] ?? "";
      await tx.profile.update({
        where: { id: userId },
        data: {
          name,
          niche: input.niche,
          goals: input.goals,
          briefingTime: input.briefingTime,
          timezone: input.timezone ?? current.timezone,
          signOff: current.signOff || (first ? `Best,\n${first}` : ""),
          onboardedAt: current.onboardedAt ?? new Date(),
        },
      });
      for (const provider of PROVIDERS) {
        const status = input.accounts?.[provider];
        if (!status) continue;
        await tx.connectedAccount.upsert({
          where: { profileId_provider: { profileId: userId, provider } },
          create: { profileId: userId, provider, status },
          update: { status },
        });
      }
      if (input.sampleWorkspace && !(await hasWorkspace(userId, tx))) {
        await seedSampleWorkspace(userId, tx, todayIn(input.timezone ?? current.timezone));
      }
    },
    { timeout: 30_000 },
  );
  await afterSeed(userId, async () => undefined);
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, include: profileInclude });
  return toProfileDto(profile, await hasWorkspace(userId));
}

// Sample text was indexed inside the seed's transaction; its embeddings
// are made by the worker afterwards.
async function afterSeed(userId: string, run: () => Promise<void>) {
  await run();
  if (features.embeddings) await enqueueEmbedding(userId);
}

export async function loadSampleWorkspace(userId: string) {
  await afterSeed(userId, () => seed(userId));
}

async function seed(userId: string) {
  const { timezone } = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  await prisma.$transaction((tx) => seedSampleWorkspace(userId, tx, todayIn(timezone)), { timeout: 30_000 });
}
