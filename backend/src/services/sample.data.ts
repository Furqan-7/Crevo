// The sample creator's workspace (Maya Lopez, 180k on YouTube), written into
// a new account's own rows when onboarding asks for it, so every screen has
// something real to show before Gmail, Calendar and YouTube are connected.
// Dates are written for SAMPLE_TODAY (Wed 28 Oct 2026). Seeding moves every
// date by however many days separate that from the creator's real today,
// and renders the {{YYYY-MM-DD:format}} tokens in the text to match (see
// renderDates in workspace.service.ts).

import type {
  AlertKind,
  Category,
  Channel,
  DealHealth,
  DealStage,
  EventType,
  IdeaPlatform,
  MessageSource,
  PublishPlatform,
  Tone,
} from "../types/api";

export const SAMPLE_TODAY = "2026-10-28";

export interface SampleMessage {
  key: string;
  dealSlug?: string;
  source: MessageSource;
  category: Category;
  fromName: string;
  fromAddress: string;
  avatarInitial: string;
  avatarColor: string;
  subject: string;
  preview: string;
  body: string[];
  senderSignOff: string;
  summary: string;
  receivedAt: string;
  read: boolean;
  draftReady: boolean;
  minutesSaved: number;
  drafts?: Record<Tone, string>;
}

export const sampleMessages: SampleMessage[] = [
  {
    key: "nike",
    dealSlug: "nike",
    source: "gmail",
    category: "brand_deal",
    fromName: "Alex · Nike Partnerships",
    fromAddress: "alex@nike-partners.com",
    avatarInitial: "N",
    avatarColor: "#181818",
    subject: "Re: Spring campaign brief",
    preview: "Thanks Maya! Can you confirm the delivery dates and the deliverables before we send the contract?",
    body: [
      "Hi Maya, thanks for the quick reply on the brief! Can you confirm you can deliver the Reel and two Stories by **{{2026-10-30:F}}**? Once confirmed, we'll send the contract over for signature.",
    ],
    senderSignOff: "Alex",
    summary: "Nike wants confirmation of 3 deliverables by {{2026-10-30:f}}. Fee $4,000. Contract not signed yet; payment terms missing.",
    receivedAt: "2026-10-28T09:02:00Z",
    read: false,
    draftReady: true,
    minutesSaved: 8,
    drafts: {
      friendly:
        "Hi Alex,\n\nThanks for the brief! The Reel and two Stories work for me, and I can deliver by =={{2026-10-30:F}}==. Before I sign, can we confirm ==Net 30 payment terms== and ==two revision rounds==?\n\nBest,\nMaya",
      professional:
        "Hi Alex,\n\nThank you for sending the brief. I can confirm delivery of one Reel and two Stories by =={{2026-10-30:F}}==. Before signing, I'd like the contract to include ==Net 30 payment terms== and a limit of ==two revision rounds==.\n\nKind regards,\nMaya Lopez",
      shorter:
        "Hi Alex,\n\nConfirmed: Reel and two Stories by =={{2026-10-30:F}}==. Can the contract add ==Net 30 payment terms== and ==two revision rounds==?\n\nThanks,\nMaya",
    },
  },
  {
    key: "glossier",
    dealSlug: "glossier",
    source: "gmail",
    category: "brand_deal",
    fromName: "Jess · Glossier",
    fromAddress: "jess@glossier-partners.com",
    avatarInitial: "G",
    avatarColor: "#d64535",
    subject: "Invoice #0142",
    preview: "Following up on the holiday edit payment. Finance asked me to check one detail on the invoice...",
    body: [
      "Hi Maya, following up on the holiday edit payment. Finance asked me to check the invoice number on our side before they release it. Is it **#0142**?",
    ],
    senderSignOff: "Jess",
    summary: "Glossier owes $2,500 for the Holiday edit. Invoice #0142 was due {{2026-10-22:D}} and is 6 days overdue.",
    receivedAt: "2026-10-27T16:40:00Z",
    read: true,
    draftReady: true,
    minutesSaved: 10,
    drafts: {
      friendly:
        "Hi Jess,\n\nThanks for checking! Yes, it's ==invoice #0142== for ==$2,500==. It was due on =={{2026-10-22:d}}== under our Net 30 terms, so I'd be grateful if finance could release it this week. Happy to resend it if that helps.\n\nThanks,\nMaya",
      professional:
        "Hi Jess,\n\nThank you for following up. I can confirm the reference is ==invoice #0142== for ==$2,500==, which fell due on =={{2026-10-22:d}}== under our Net 30 terms. Please let me know if finance needs anything else to process the payment.\n\nKind regards,\nMaya Lopez",
      shorter: "Hi Jess,\n\nYes, ==invoice #0142==, ==$2,500==, due =={{2026-10-22:d}}==. Could finance release it this week?\n\nThanks,\nMaya",
    },
  },
  {
    key: "leo",
    source: "gmail",
    category: "collab",
    fromName: "Leo Films",
    fromAddress: "hello@leofilms.co",
    avatarInitial: "L",
    avatarColor: "#3d7a35",
    subject: "Gear swap video next week?",
    preview: "Hey! Want to shoot a gear swap video next week? I'll bring my cinema kit, you bring your vlog setup...",
    body: [
      "Hey! Want to shoot a gear swap video next week? I'll bring my cinema kit, you bring your vlog setup, and we each film a day with the other's gear. I'm free **Tuesday or Wednesday afternoon**.",
    ],
    senderSignOff: "Leo",
    summary: "A collab video with Leo Films (64k subscribers). He's free Tue or Wed afternoon; both are open in your calendar.",
    receivedAt: "2026-10-28T08:41:00Z",
    read: false,
    draftReady: true,
    minutesSaved: 5,
    drafts: {
      friendly:
        "Hey Leo,\n\nLove this idea! ==Tuesday or Wednesday afternoon== both work for me. Want to film at ==my studio==? I'll send a calendar invite once you pick a slot.\n\nMaya",
      professional:
        "Hi Leo,\n\nThanks for reaching out, a gear swap sounds great. I'm available ==Tuesday or Wednesday afternoon== and can host at ==my studio==. Let me know which suits you and I'll send an invite.\n\nBest,\nMaya",
      shorter: "Hey Leo, I'm in! ==Tue or Wed afternoon== at ==my studio==? Pick one and I'll send an invite.\n\nMaya",
    },
  },
  {
    key: "priya",
    source: "gmail",
    category: "collab",
    fromName: "Priya · Studio Sana",
    fromAddress: "priya@studiosana.fm",
    avatarInitial: "P",
    avatarColor: "#7b77e8",
    subject: "Podcast guest spot",
    preview: "We'd love to have you on episode 42 to talk about building a one-person studio...",
    body: [
      "Hi Maya, we'd love to have you on **episode 42** of Studio Sana to talk about building a one-person studio. Recording is remote and takes about 45 minutes. Would any day in the **week of {{2026-11-09:d}}** work?",
    ],
    senderSignOff: "Priya",
    summary:
      "A podcast invite for episode 42, recorded remotely in the week of {{2026-11-09:D}}. No fee mentioned. Crevo didn't draft a reply because it needs your decision.",
    receivedAt: "2026-10-28T08:15:00Z",
    read: false,
    draftReady: false,
    minutesSaved: 6,
    drafts: {
      friendly:
        "Hi Priya,\n\nThanks so much for thinking of me! I'd love to join ==episode 42==. =={{2026-11-10:F}}== or =={{2026-11-12:F}}== work best for me. Could you share the topics ahead of time?\n\nMaya",
      professional:
        "Hi Priya,\n\nThank you for the invitation. I'd be happy to join ==episode 42==. I'm available =={{2026-11-10:F}}== or =={{2026-11-12:F}}==. Could you send an outline of the topics beforehand?\n\nBest regards,\nMaya Lopez",
      shorter: "Hi Priya, I'd love to! =={{2026-11-10:h}}== or =={{2026-11-12:g}}==? Topics in advance would help.\n\nMaya",
    },
  },
  {
    key: "sam",
    source: "youtube",
    category: "fan_question",
    fromName: "@sam.creates",
    fromAddress: "YouTube comment · Camera setup vlog",
    avatarInitial: "S",
    avatarColor: "#c99a00",
    subject: "What mic do you use?",
    preview: "Your vlogs sound so clean, what mic is that? I've tried three and none sound like yours.",
    body: ["Your vlogs sound so clean, what mic is that? I've tried three and none sound like yours."],
    senderSignOff: "Sam",
    summary: "A fan question. 12 people asked about your gear this week, so it's also on today's ideas list.",
    receivedAt: "2026-10-28T07:58:00Z",
    read: false,
    draftReady: true,
    minutesSaved: 3,
    drafts: {
      friendly:
        "Hey Sam! I use a ==small wireless clip-on mic== for vlogs and a ==shotgun mic== in the studio. Full list is ==linked in my bio==. Thanks for watching!",
      professional:
        "Thanks Sam! I record vlogs with a ==wireless clip-on mic== and studio videos with a ==shotgun mic==. The full kit list is ==linked in my bio==.",
      shorter: "Thanks Sam! ==Wireless clip-on== for vlogs, ==shotgun mic== in the studio. Full list ==in my bio==.",
    },
  },
  {
    key: "ana",
    source: "instagram",
    category: "fan_question",
    fromName: "@ana.films",
    fromAddress: "Instagram DM",
    avatarInitial: "A",
    avatarColor: "#c99a00",
    subject: "Camera settings for low light?",
    preview: "Loved the night walk video! What ISO and shutter speed did you use for the street shots?",
    body: ["Loved the night walk video! What ISO and shutter speed did you use for the street shots?"],
    senderSignOff: "Ana",
    summary: "A fan question about your night walk video settings.",
    receivedAt: "2026-10-28T07:30:00Z",
    read: true,
    draftReady: false,
    minutesSaved: 2,
    drafts: {
      friendly:
        "Thank you Ana! For the street shots I was at ==ISO 3200==, ==1/50 shutter== and ==f/1.8==. A cheap ND filter helps once the shop lights get bright!",
      professional: "Thanks Ana! The street shots were filmed at ==ISO 3200==, ==1/50 shutter== and ==f/1.8==.",
      shorter: "Thanks Ana! ==ISO 3200==, ==1/50==, ==f/1.8==.",
    },
  },
  {
    key: "spam",
    source: "gmail",
    category: "spam",
    fromName: "Growth Boost Team",
    fromAddress: "promo@growthboost.biz",
    avatarInitial: "G",
    avatarColor: "#9a9a9a",
    subject: "Get 10k followers in 7 days 🚀",
    preview: "Exclusive creator offer: real followers, guaranteed results...",
    body: ["Exclusive creator offer: real followers, guaranteed results. Reply YES to claim your spot."],
    senderSignOff: "The Growth Boost Team",
    summary: "Marked as spam: a paid-followers offer from an unknown sender. No reply needed.",
    receivedAt: "2026-10-28T06:12:00Z",
    read: true,
    draftReady: false,
    minutesSaved: 0,
  },
];

export interface SampleDeal {
  slug: string;
  brand: string;
  color: string;
  campaign: string;
  stage: DealStage;
  amount: number;
  dueDate: string;
  source: string;
  alert?: { text: string; tone: "warn" | "bad" };
  health: DealHealth;
  invoice?: { number: string; dueDate: string };
  paidAt?: string;
  reminderDraft?: string;
  terms: { label: string; value: string; clause?: string; missing?: boolean }[];
  risks: { title: string; fix: string }[];
  deliverables: { title: string; dueDate: string; done: boolean }[];
}

export const sampleDeals: SampleDeal[] = [
  {
    slug: "adidas",
    brand: "Adidas",
    color: "#181818",
    campaign: "Run club series",
    stage: "new_offer",
    amount: 3200,
    dueDate: "2026-11-20",
    source: "from contract.pdf",
    health: { financial: 15, deadline: 20, contract: 12, scope: 14 },
    terms: [
      { label: "Fee", value: "$3,200" },
      { label: "Deliverables", value: "3 Reels", clause: "§3.2" },
      { label: "Usage rights", value: "90 days", clause: "§8.1" },
      { label: "Payment terms", value: "Missing", clause: "§5", missing: true },
    ],
    risks: [
      { title: "No payment terms", fix: "Ask for Net 30 in writing." },
      { title: "Unlimited revisions", fix: "Cap at 2 rounds (§4.4)." },
      { title: "90 days of free usage", fix: "Add a fee for paid usage." },
    ],
    deliverables: [
      { title: "Reel #1: club run", dueDate: "2026-11-06", done: false },
      { title: "Reel #2: gear check", dueDate: "2026-11-13", done: false },
      { title: "Reel #3: race day", dueDate: "2026-11-20", done: false },
    ],
  },
  {
    slug: "spotify",
    brand: "Spotify",
    color: "#1db954",
    campaign: "Wrapped teaser",
    stage: "new_offer",
    amount: 1800,
    dueDate: "2026-12-01",
    source: "from email",
    health: { financial: 22, deadline: 22, contract: 24, scope: 16 },
    terms: [
      { label: "Fee", value: "$1,800" },
      { label: "Deliverables", value: "1 Short", clause: "brief" },
      { label: "Usage rights", value: "30 days", clause: "brief" },
      { label: "Payment terms", value: "Net 30", clause: "brief" },
    ],
    risks: [{ title: "No contract yet", fix: "Ask for the contract before you film." }],
    deliverables: [{ title: "Short: Wrapped teaser", dueDate: "2026-12-01", done: false }],
  },
  {
    slug: "nike",
    brand: "Nike",
    color: "#181818",
    campaign: "Spring campaign",
    stage: "negotiating",
    amount: 4000,
    dueDate: "2026-10-30",
    source: "from contract.pdf",
    alert: { text: "Waiting on payment terms", tone: "warn" },
    health: { financial: 17, deadline: 25, contract: 19, scope: 17 },
    terms: [
      { label: "Fee", value: "$4,000" },
      { label: "Deliverables", value: "1 Reel, 2 Stories", clause: "§4.1" },
      { label: "Usage rights", value: "60 days", clause: "§7.1" },
      { label: "Payment terms", value: "Missing", clause: "§6", missing: true },
    ],
    risks: [
      { title: "No payment terms", fix: "Ask for Net 30 in writing." },
      { title: "Unlimited revisions", fix: "Cap at 2 rounds (§5.2)." },
      { title: "Free usage rights", fix: "Add a fee for 60 days of paid use." },
    ],
    deliverables: [
      { title: "Reel: concept and script", dueDate: "2026-10-26", done: true },
      { title: "Story #1: launch day", dueDate: "2026-10-29", done: false },
      { title: "Story #2: recap", dueDate: "2026-10-30", done: false },
    ],
  },
  {
    slug: "canon",
    brand: "Canon",
    color: "#e60012",
    campaign: "Low-light review",
    stage: "in_production",
    amount: 2400,
    dueDate: "2026-11-06",
    source: "from contract.pdf",
    health: { financial: 23, deadline: 24, contract: 27, scope: 17 },
    terms: [
      { label: "Fee", value: "$2,400" },
      { label: "Deliverables", value: "1 YouTube video", clause: "§2.1" },
      { label: "Usage rights", value: "30 days", clause: "§6.3" },
      { label: "Payment terms", value: "Net 30", clause: "§5" },
    ],
    risks: [],
    deliverables: [
      { title: "Script approved", dueDate: "2026-10-26", done: true },
      { title: "Night shoot", dueDate: "2026-11-02", done: false },
      { title: "Video goes live", dueDate: "2026-11-06", done: false },
    ],
  },
  {
    slug: "audible",
    brand: "Audible",
    color: "#f7991c",
    campaign: "Book of the month",
    stage: "in_production",
    amount: 900,
    dueDate: "2026-11-12",
    source: "from contract.pdf",
    health: { financial: 20, deadline: 23, contract: 28, scope: 17 },
    terms: [
      { label: "Fee", value: "$900" },
      { label: "Deliverables", value: "60s ad read", clause: "§2" },
      { label: "Usage rights", value: "In video only", clause: "§4" },
      { label: "Payment terms", value: "Net 45", clause: "§3" },
    ],
    risks: [{ title: "Net 45 payment", fix: "Ask for Net 30 next time." }],
    deliverables: [
      { title: "Ad read recorded", dueDate: "2026-11-09", done: false },
      { title: "Video with ad goes live", dueDate: "2026-11-12", done: false },
    ],
  },
  {
    slug: "glossier",
    brand: "Glossier",
    color: "#d64535",
    campaign: "Holiday edit",
    stage: "invoiced",
    amount: 2500,
    dueDate: "2026-09-22",
    source: "from invoice #0142",
    alert: { text: "6 days overdue · reminder drafted", tone: "bad" },
    health: { financial: 24, deadline: 25, contract: 27, scope: 16 },
    invoice: { number: "#0142", dueDate: "2026-10-22" },
    reminderDraft:
      "Hi Jess,\n\nHope the holiday launch went well! A quick note that invoice #0142 ($2,500) was due on {{2026-10-22:d}} under our Net 30 terms. Could you check on its status? Happy to resend it if that helps.\n\nThanks,\nMaya",
    terms: [
      { label: "Fee", value: "$2,500" },
      { label: "Deliverables", value: "1 Reel, 1 TikTok", clause: "§3" },
      { label: "Usage rights", value: "30 days", clause: "§6" },
      { label: "Payment terms", value: "Net 30 · 6 days late", clause: "§5", missing: true },
    ],
    risks: [{ title: "Payment overdue", fix: "Send the drafted reminder today." }],
    deliverables: [
      { title: "Reel: holiday edit", dueDate: "2026-09-14", done: true },
      { title: "TikTok: gift guide", dueDate: "2026-09-22", done: true },
    ],
  },
  // Finished and paid; these feed the revenue chart, not the board.
  ...(
    [
      ["rode", "Rode", "#111111", "Wireless mic review", 2400, "2026-05-20"],
      ["squarespace", "Squarespace", "#000000", "Portfolio sponsor", 3100, "2026-06-18"],
      ["dji", "DJI", "#1f1f1f", "Summer travel series", 4600, "2026-07-24"],
      ["skillshare", "Skillshare", "#00ff84", "Editing class sponsor", 2800, "2026-08-21"],
      ["sony", "Sony", "#0a0a0a", "Back to school kit", 5200, "2026-09-25"],
      ["adobe", "Adobe", "#fa0f00", "Premiere tips Short", 3300, "2026-10-16"],
    ] as const
  ).map(
    ([slug, brand, color, campaign, amount, paidAt]): SampleDeal => ({
      slug,
      brand,
      color,
      campaign,
      stage: "paid",
      amount,
      dueDate: paidAt,
      source: "from contract.pdf",
      health: { financial: 22, deadline: 24, contract: 26, scope: 17 },
      paidAt,
      terms: [],
      risks: [],
      deliverables: [],
    }),
  ),
];

export const sampleTodos: { title: string; detail: string; dueDate: string; dueMinutes: number | null; done: boolean }[] = [
  { title: "Reply to Nike brief", detail: "Brand deal · approved draft", dueDate: "2026-10-28", dueMinutes: 9 * 60 + 10, done: true },
  { title: "Film camera setup Short", detail: "Idea from 12 comments", dueDate: "2026-10-28", dueMinutes: 11 * 60, done: false },
  { title: "Approve Reel caption", detail: "Publish · goes out 6:30 pm", dueDate: "2026-10-28", dueMinutes: 17 * 60, done: false },
  { title: "Chase Glossier invoice", detail: "$2,500 · follow-up drafted", dueDate: "2026-10-28", dueMinutes: null, done: false },
  { title: "Review Adidas contract", detail: "Deal Health 61 · 3 risks", dueDate: "2026-10-30", dueMinutes: null, done: false },
];

export const sampleIdeas: { title: string; why: string; platforms: IdeaPlatform[] }[] = [
  { title: "“What camera do you use?” – 60s Short", why: "12 comments asked this week", platforms: ["shorts", "reels"] },
  { title: "Studio tour: before and after", why: "Your tours get 2.1x average views", platforms: ["youtube"] },
  { title: "3 apps I use to edit on my phone", why: "Rising in your niche this week", platforms: ["tiktok"] },
];

// `link` can name a deal slug or a sample message key; the seed turns
// them into real URLs once the rows exist.
export const sampleEvents: {
  title: string;
  type: EventType;
  date: string;
  start: number;
  end: number;
  detail: string;
  link?: { deal: string } | { message: string } | { publish: true };
  tentative?: boolean;
  done?: boolean;
}[] = [
  { title: "Nike Reel: concept and script", type: "film", date: "2026-10-26", start: 600, end: 720, detail: "Studio · first deliverable for the Spring campaign", link: { deal: "nike" }, done: true },
  { title: "Canon script approved", type: "call", date: "2026-10-26", start: 900, end: 930, detail: "Video call with the Canon team", link: { deal: "canon" }, done: true },
  { title: "Edit: vlog_tuesday", type: "film", date: "2026-10-27", start: 780, end: 1020, detail: "14-minute vlog, cut into 3 clips", link: { publish: true }, done: true },
  { title: "Film camera setup Short", type: "film", date: "2026-10-28", start: 660, end: 720, detail: "Idea from 12 comments · on today's to-do" },
  { title: "Adidas contract review", type: "call", date: "2026-10-30", start: 600, end: 630, detail: "Deal Health 61 · 3 risks to raise", link: { deal: "adidas" } },
  { title: "Film: studio tour before and after", type: "film", date: "2026-10-31", start: 600, end: 780, detail: "Your tours get 2.1x average views" },
  { title: "Canon night shoot", type: "film", date: "2026-11-02", start: 1140, end: 1290, detail: "Low-light review · city centre", link: { deal: "canon" } },
  { title: "Gear swap with Leo Films", type: "film", date: "2026-11-03", start: 840, end: 1020, detail: "Tentative until Leo picks a slot", link: { message: "leo" }, tentative: true },
  { title: "Studio Sana podcast, ep. 42", type: "call", date: "2026-11-10", start: 660, end: 705, detail: "Remote recording · tentative", link: { message: "priya" }, tentative: true },
];

export const sampleAlerts: { kind: AlertKind; title: string; detail: string; href: string; dealSlug?: string; createdAt: string; read: boolean }[] = [
  { kind: "overdue", title: "Glossier's payment is 6 days overdue", detail: "$2,500 · invoice #0142. A polite reminder is drafted.", href: "/dashboard/deals?deal=glossier", dealSlug: "glossier", createdAt: "2026-10-28T09:00:00Z", read: false },
  { kind: "deadline", title: "Nike Story #1 is due tomorrow", detail: "{{2026-10-29:f}} · Spring campaign · not in your calendar yet", href: "/dashboard/calendar?date=2026-10-29", dealSlug: "nike", createdAt: "2026-10-28T08:00:00Z", read: false },
  { kind: "deadline", title: "Camera setup Reel needs your approval", detail: "It's set to go out today at 6:30 pm", href: "/dashboard/publish", createdAt: "2026-10-28T08:00:00Z", read: false },
  { kind: "new_deal", title: "New offer from Adidas", detail: "Run club series · $3,200 · Deal Health 61, 3 risks", href: "/dashboard/deals?deal=adidas", dealSlug: "adidas", createdAt: "2026-10-27T15:20:00Z", read: false },
  { kind: "new_deal", title: "Spotify wants a Wrapped teaser", detail: "$1,800 · 1 Short · due {{2026-12-01:f}}", href: "/dashboard/deals?deal=spotify", dealSlug: "spotify", createdAt: "2026-10-26T11:05:00Z", read: true },
  { kind: "weekly", title: "Your week: $3,300 in, 9 posts out", detail: "6.5 hours saved · views up 13.9%", href: "/dashboard/analytics?range=7", createdAt: "2026-10-25T18:00:00Z", read: true },
];

export const sampleVideo = {
  fileName: "vlog_tuesday.mp4",
  lengthSec: 872,
  quality: "1080p",
  transcript: [
    { sec: 4, text: "Okay, morning! It's Tuesday, and today is all about the setup." },
    { sec: 21, text: "A lot of you asked in the comments what I film with, so let's finally do it." },
    { sec: 52, text: "Here's the setup I use for every video. Camera, one lens, one mic." },
    { sec: 66, text: "The lens is a 24 millimetre, and honestly it covers ninety percent of what I shoot." },
    { sec: 79, text: "Everything is linked in my bio, so you don't have to screenshot this." },
    { sec: 140, text: "Before we go further, coffee. Non-negotiable." },
    { sec: 212, text: "This is the corner of the studio I film most of my talking shots in." },
    { sec: 331, text: "Now, this forty dollar light changed everything for me." },
    { sec: 352, text: "Look at the difference. Same room, same camera, just this one light." },
    { sec: 372, text: "If you buy one thing after this video, make it a light, not a lens." },
    { sec: 455, text: "Okay, quick break to answer a few comments." },
    { sec: 540, text: "Someone asked how long editing takes me. Usually a full day per video." },
    { sec: 618, text: "Mic test: before and after. Here's the camera's built-in mic." },
    { sec: 633, text: "And here's the clip-on. Same voice, same room. Hear that?" },
    { sec: 644, text: "That's the biggest upgrade for the least money." },
    { sec: 760, text: "Next week I'm doing a gear swap with Leo, so subscribe for that." },
    { sec: 852, text: "That's it for today. Thanks for watching, see you Friday." },
  ],
  clips: [
    {
      short: "Camera setup",
      title: "“Here's the setup I use for every video”",
      quote: "The camera setup I use for every video",
      startSec: 52,
      endSec: 79,
      why: "strong hook, answers 12 comments",
      hook: 92,
      color: "#7b77e8",
      captions: {
        reel: [
          "The camera setup I use for every video, in 30 seconds. 🎥 Lens, mic and lights are linked in my bio. Save this for your next shoot and tell me what you want to see next!",
          "You asked, so here it is: my whole camera setup in 30 seconds. 🎥 Everything is linked in my bio. Which piece should I review next?",
        ],
        short: ["My entire camera setup in 30 seconds 🎥 #shorts", "The setup behind every video I make, in 30 seconds 🎥 #shorts"],
        tiktok: ["the camera setup I use for every single video 🎥 links in bio", "pov: you finally see the whole setup 🎥 everything's in my bio"],
      } satisfies Record<PublishPlatform, string[]>,
      hashtags: ["#creatorsetup", "#filmmaking", "#youtubetips", "#camerasetup", "#contentcreator"],
    },
    {
      short: "$40 light",
      title: "The $40 light that changed everything",
      quote: "This $40 light changed everything",
      startSec: 331,
      endSec: 372,
      why: "surprising, shareable",
      hook: 87,
      color: "#56c25a",
      captions: {
        reel: [
          "This $40 light did more for my videos than my last camera upgrade. 💡 Before and after in the video. Link in bio.",
          "Stop buying lenses, buy this $40 light. 💡 Before and after inside. Link in bio.",
        ],
        short: ["The $40 light that changed my videos 💡 #shorts", "$40 light vs. my old setup 💡 #shorts"],
        tiktok: ["this $40 light changed everything 💡", "the cheapest upgrade I've ever made 💡"],
      } satisfies Record<PublishPlatform, string[]>,
      hashtags: ["#lightingtips", "#budgetgear", "#videotips", "#filmmaking", "#creatorsetup"],
    },
    {
      short: "Mic test",
      title: "Mic test: before and after",
      quote: "Mic test: before and after",
      startSec: 618,
      endSec: 644,
      why: "quick payoff",
      hook: 81,
      color: "#e2a400",
      captions: {
        reel: ["Same room, same voice, different mic. 🎙️ Turn your sound on for the before and after.", "Sound on: the mic test you asked for. 🎙️ Which one would you pick?"],
        short: ["Mic test: before and after 🎙️ #shorts", "Can you hear the difference? 🎙️ #shorts"],
        tiktok: ["sound on 🎙️ before vs after", "the mic test you asked for 🎙️"],
      } satisfies Record<PublishPlatform, string[]>,
      hashtags: ["#mictest", "#audiotips", "#youtubetips", "#vlogging", "#contentcreator"],
    },
  ],
};

export const sampleTopContent: { title: string; channel: Channel; format: string; views: number; engagement: number; postedAt: string }[] = [
  { title: "What camera do you use?", channel: "youtube", format: "Short", views: 212000, engagement: 9.8, postedAt: "2026-10-03" },
  { title: "Studio tour 2026: before and after", channel: "youtube", format: "Video", views: 96000, engagement: 7.1, postedAt: "2026-09-20" },
  { title: "Night walk, filmed on a phone", channel: "instagram", format: "Reel", views: 88000, engagement: 8.4, postedAt: "2026-10-16" },
  { title: "$40 light vs my old setup", channel: "tiktok", format: "TikTok", views: 74000, engagement: 11.2, postedAt: "2026-10-22" },
  { title: "My editing setup in 60 seconds", channel: "tiktok", format: "TikTok", views: 61000, engagement: 10.4, postedAt: "2026-09-15" },
  { title: "3 mics under $100", channel: "youtube", format: "Video", views: 41000, engagement: 6.3, postedAt: "2026-09-30" },
];

// 180 days of channel stats ending on WORKSPACE_TODAY, from fixed formulas
// (trend, weekend lift, a few viral spikes) so every sample account matches.
const CHANNELS: Channel[] = ["youtube", "instagram", "tiktok"];
const BASE: Record<Channel, number> = { youtube: 11000, instagram: 7000, tiktok: 8500 };
const GROWTH: Record<Channel, number> = { youtube: 0.0016, instagram: 0.0011, tiktok: 0.0022 };
const SPIKES: Record<Channel, number[]> = {
  youtube: [3, 17, 40, 66, 101, 140],
  instagram: [9, 24, 52, 88, 130],
  tiktok: [6, 13, 31, 58, 95, 122, 160],
};
const FOLLOW_RATE: Record<Channel, number> = { youtube: 0.0041, instagram: 0.0061, tiktok: 0.0052 };

function noise(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function sampleChannelDays(addDays: (iso: string, days: number) => string) {
  return Array.from({ length: 180 }, (_, i) => {
    const back = 179 - i;
    const date = addDays(SAMPLE_TODAY, -back);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 1.12 : 1;
    return CHANNELS.map((channel, c) => {
      const trend = BASE[channel] * (1 + GROWTH[channel] * i);
      const spike = SPIKES[channel].reduce((sum, d) => sum + (back <= d && back > d - 4 ? 2.6 / (d - back + 1) : 0), 0);
      const v = trend * weekend * (0.82 + noise(i * 3 + c) * 0.36) * (1 + spike);
      const views = Math.round(v / 10) * 10;
      return {
        channel,
        date,
        views,
        followers: Math.round(v * FOLLOW_RATE[channel]),
        watchMinutes: channel === "youtube" ? Math.round(views * 2.9) : null,
      };
    });
  }).flat();
}
