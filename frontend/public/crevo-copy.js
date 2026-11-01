// Keeps the Crevo copy on the page after Framer's runtime takes over.
//
// The section components already render Crevo text, but Framer's own
// runtime (loaded from framerusercontent.com) re-renders parts of the page a
// few seconds after load from its copy of the original Verseo template, which
// puts the old words back. This script watches the DOM and swaps each old
// string for its Crevo version as soon as it appears. MutationObserver
// callbacks run before the browser paints, so the old text never shows.
//
// Swaps are scoped to the section named by the nearest data-framer-name
// ancestor, because the same template string can need different copy in
// different sections. Anything outside those sections uses the global map.
// Hides the page (on its own background colour) until Framer's runtime has
// loaded and re-rendered it, then fades it in. Without this, visitors see the
// page as exported for about the time Framer takes to load, and then watch it
// change. Shown anyway after 4 seconds, or as soon as the runtime fails to load.
(function () {
  var root = document.documentElement;
  var style = document.createElement("style");
  style.textContent =
    "html.crevo-loading,html.crevo-loading body{background:#f9f9f9}" +
    "html.crevo-loading body{opacity:0}" +
    "body{transition:opacity .3s ease}";
  document.head.appendChild(style);
  root.classList.add("crevo-loading");

  var shown = false, quiet = null;
  function show() {
    if (shown) return;
    shown = true;
    root.classList.remove("crevo-loading");
  }
  function settle(ms) {
    clearTimeout(quiet);
    quiet = setTimeout(show, ms);
  }
  setTimeout(show, 4000);

  var isFramer = function (el) { return el && el.tagName === "SCRIPT" && /framerusercontent\.com/.test(el.src || ""); };
  // Framer's main bundle has run: show the page once its re-render settles.
  document.addEventListener("load", function (e) {
    if (!isFramer(e.target) || shown) return;
    settle(500);
    var main = document.getElementById("main") || document.body;
    new MutationObserver(function () { if (!shown) settle(250); })
      .observe(main, { childList: true, subtree: true, characterData: true });
  }, true);
  document.addEventListener("error", function (e) { if (isFramer(e.target)) show(); }, true);
  // Coming back with the browser's back button: the page is already rendered.
  window.addEventListener("pageshow", function (e) { if (e.persisted) show(); });
})();

(function () {
  var COPY = {
 "sections": {
  "Hero": {
   "AI writing tool": "AI OS for creators",
   "Write better content.": "Run your creator business.",
   "Faster. With AI": "Smarter. With AI",
   "Verseo helps teams, founders, and marketers generate high-quality content in seconds — without overthinking every word": "Your inbox, brand deals, content and schedule in one place, with a daily briefing that tells you what to do and does the busywork for you.",
   "What do you want to write today?": "What needs me today?",
   "AI Writer": "Briefing",
   "Brand Voice": "Inbox",
   "Rewrite": "Publish",
   "Summarize": "Deals",
   "Get Started": "Get started free",
   "Try Demo": "See how it works"
  },
  "Client Logos": {
   "Trusted by modern teams": "Works with the platforms you already use"
  },
  "Problem And Difference": {
   "Where content friction ": "Where creator chaos ",
   "Where content friction ends, clarity begins": "Where creator chaos ends, clarity begins",
   "See how AI replaces slow, manual writing with fast, structured content creation.": "See how AI replaces scattered tools and busywork with one workspace that acts for you.",
   "Fragmented writing": "Scattered tools",
   "Ideas don’t translate into clear content": "Messages spread across five apps",
   "Constantly starting from a blank page": "Deadlines kept in your head",
   "No clear structure or direction": "No single view of what needs you today",
   "Manual workflows": "Endless busywork",
   "Writing takes too much time": "Captions rewritten for every platform",
   "Endless editing and rewriting": "Chasing brands for late payments",
   "Inconsistent tone across channels": "More time managing than creating",
   "AI-powered content flow": "One creator OS",
   "Generate structured content in seconds": "A daily briefing of what needs you",
   "Keep your voice consistent everywhere": "Every message sorted, replies drafted",
   "Refine, edit, and scale effortlessly": "Post once, publish everywhere"
  },
  "Features": {
   "Everything you need ": "Everything your creator ",
   "to create better content": "business needs",
   "Everything you need to create better content": "Everything your creator business needs",
   "Create, refine, and scale content - faster and without starting from scratch.": "Inbox, content, deals and schedule - handled in one place, with AI doing the busywork.",
   "AI Writing": "Unified Inbox",
   "Start from a simple idea and turn it into structured, high-quality content in seconds.": "Emails, comments and DMs in one feed, sorted into deals, collabs, fans and spam.",
   "No more blank pages.": "Replies drafted. You approve.",
   "Smart Rewrite": "Daily Briefing",
   "Improve clarity, structure, and tone instantly without rewriting from scratch.": "Every morning: your to-do list, messages that need you, deal updates and today's content ideas.",
   "Fix and refine in one click.": "Know your day at a glance.",
   "Tone Control": "Publish Everywhere",
   "Keep your voice consistent across every channel — from emails to social posts.": "Upload one video and get clips, captions and hashtags for every platform, scheduled.",
   "Write like your brand, every time.": "Create once, post everywhere.",
   "Ready Templates": "Deal Pipeline",
   "Use proven formats for real-world use cases — from ads to product descriptions.": "From offer to payment: rate suggestions, contract checks, deliverables and invoices.",
   "Start faster with the right structure.": "Get paid on time, every time."
  },
  "Use Cases": {
   "use cases ": "built for ",
   "Built for how you actually": "Built for how creators actually",
   "create content": "run their business",
   "Built for how you actually create content": "Built for how creators actually run their business",
   "Whether you’re creating content daily or scaling it across a team,": "Whether you post daily or manage a roster of creators,",
   "Verseo adapts to your workflow.": "Crevo adapts to your workflow.",
   "Whether you’re creating content daily or scaling it across a team, Verseo adapts to your workflow.": "Whether you post daily or manage a roster of creators, Crevo adapts to your workflow.",
   "For marketers": "For solo creators",
   "For founders": "For talent managers",
   "For teams": "For creator teams",
   "Create ads, emails, landing pages, and social content - without starting from scratch. Quickly generate multiple variations, test different angles, and adapt your message for every platform in seconds.": "Wake up to one briefing: messages sorted, replies drafted, deal deadlines flagged and today's content ideas picked from what your audience asks - so your morning goes to creating, not admin.",
   "Write product copy, pitches, and updates with more clarity and less effort. Turn rough ideas into structured messaging that clearly explains your product, value, and positioning.": "See every creator's deals, deadlines and payments on one board. Know which campaign needs attention, chase late invoices in one click, and keep brands updated without digging through inboxes.",
   "Keep your messaging consistent across every channel, no matter who’s writing. Align your tone, structure, and communication style across your entire team - from social media and email campaigns to landing pages, product copy, and client communication.": "Editors, assistants and managers work from one shared workspace. Tasks come straight from contracts and the content calendar, approvals stay with the creator, and the Copilot answers \"what's due this week?\" with sources."
  },
  "How It Works": {
   "Turn any idea into ready-to-use ": "Turn one upload into ready-to-post ",
   "content in seconds": "content everywhere",
   "Turn any idea into ready-to-use content in seconds": "Turn one upload into ready-to-post content everywhere",
   "No complex tools or long workflows - just describe what you need,": "No juggling apps or rewriting captions - just upload your video,",
   "and Verseo does the rest.": "and Crevo does the rest.",
   "No complex tools or long workflows - just describe what you need, and Verseo does the rest.": "No juggling apps or rewriting captions - just upload your video, and Crevo does the rest.",
   "Enter your idea": "Upload your video",
   "Describe what you want to create in a simple prompt - even a rough idea works.": "Drop in a long video or paste a YouTube link - Crevo reads the transcript.",
   "Generate content": "Get clips and captions",
   "Verseo turns your input into structured, high-quality content in seconds.": "AI picks the best moments and writes titles, captions and hashtags per platform.",
   "Refine and publish": "Approve and schedule",
   "Adjust tone, edit, and use your content anywhere - ready when you are.": "Review everything on one board and schedule it for the best times to post.",
   "The simpler the input, the faster you get results": "One upload in, a week of posts out",
   "Watch your content take shape": "Watch your clips take shape",
   "Structuring content": "Finding best moments",
   "analyzing tone...": "writing captions...",
   "→ understanding product context": "→ reading the transcript",
   "→ matching brand voice": "→ finding hook moments",
   "→ generating hook": "→ cutting 3 clips",
   "+ concise headline": "+ 3 short clips",
   "+ clear cta": "+ captions per platform",
   "+ launch-ready copy": "+ hashtags and titles",
   "email generation:": "scheduling:",
   "→ adapting tone": "→ checking best times",
   "→ structuring message flow": "→ Shorts, Reels and TikTok",
   "generated:": "scheduled:",
   "+ welcome email": "+ Tue 6:30 pm · Reel",
   "+ follow-up sequence": "+ Wed 12:00 pm · Short",
   "+ activation cta": "+ Thu 7:00 pm · TikTok",
   "Subject: Content creation without the bottleneck": "Instagram Reel · Tue 6:30 pm",
   "Subject:": "Instagram Reel ·",
   "Content creation without the bottleneck": "Tue 6:30 pm",
   "Hey Sarah,": "Caption:",
   "Turn rough ideas into publish-ready content in seconds.": "The camera setup I use for every video, in 30 seconds.",
   "From social posts to product copy, Promptly helps your team generate clear, consistent messaging without overthinking every word.": "Lens, mic and lights are linked below. Save this for your next shoot and tell me what you want to see next.",
   "Write faster. Edit less. Stay on-brand everywhere.": "#creatorsetup #filmmaking #youtubetips"
  },
  "Results": {
   "See the impact instantly": "Get your time back",
   "Create content faster, stay consistent across every channel,": "Spend less time on admin, never miss a deadline or payment,",
   "and achieve better results with less effort.": "and put the hours back into creating.",
   "Create content faster, stay consistent across every channel, and achieve better results with less effort.": "Spend less time on admin, never miss a deadline or payment, and put the hours back into creating.",
   "Verseo": "Crevo",
   "Stay in the flow": "Stay in creator mode",
   "Keep momentum while writing. Generate, improve, and expand ideas without breaking your creative process.": "Crevo handles the inbox, captions, deadlines and invoices in the background, so you stay focused on making things.",
   "Start Writing": "Start Creating",
   "Ready to Publish": "Your day, planned",
   "Review, edit, regenerate, and export your content wherever you need it.": "To-dos, replies, deals and content ideas, ready every morning.",
   "Less time spent editing": "Goal: less admin time",
   "Refine and finalize content faster with AI-powered suggestions and rewrites.": "Sorting, replies, captions and invoices are prepared for you to approve.",
   "Brand Voice": "Goal: deadlines met",
   "Keep messaging aligned across emails, social media, landing pages, and campaigns.": "Deliverables, posts and payments tracked on one calendar, with reminders.",
   "Content that fits anywhere": "Content that fits every platform",
   "From social posts to long-form content.": "From Shorts and Reels to long-form video."
  },
  "Examples": {
   "See what you can create ": "See what Crevo ",
   "with Verseo": "does for you",
   "See what you can create with Verseo": "See what Crevo does for you",
   "From social media posts and email campaigns to product descriptions and ": "From your morning briefing and inbox replies to captions for every platform and ",
   "ad copy — generate content tailored to any channel in seconds.": "brand deal follow-ups — prepared in seconds, approved by you.",
   "From social media posts and email campaigns to product descriptions and ad copy — generate content tailored to any channel in seconds.": "From your morning briefing and inbox replies to captions for every platform and brand deal follow-ups — prepared in seconds, approved by you.",
   "5 Ways AI Saves Time": "Your Morning Briefing",
   "Learn how modern teams use AI to streamline content creation, improve consistency, and free up time for more meaningful work.": "Today's to-do list, sorted messages, deal deadlines and three content ideas picked from what your audience asks.",
   "Productivity | AI | Teams": "Daily | Inbox | Ideas",
   "Ready to publish": "Ready at 7am",
   "Generate engaging emails with clear messaging, strong structure, and a tone that matches your brand in just a few seconds.": "Replies to brands, collaborators and fans, drafted in your tone and saved as drafts until you approve them.",
   "Campaign | Marketing | Outreach": "Brands | Collabs | Fans",
   "Generated in 3 sec": "Drafted in 3 sec",
   "Built For Growth": "Posted Everywhere",
   "Create polished product descriptions that communicate benefits clearly, build trust, and support better conversion rates.": "One video becomes clips, titles, captions and hashtags for Shorts, Reels and TikTok, scheduled at the best times.",
   "SaaS | Product | Copywriting": "Shorts | Reels | TikTok",
   "Optimized for conversion": "Optimized for reach"
  },
  "Integrations": {
   "Works with your favorite tools": "Connects to the tools you already use"
  },
  "Testimonials": {
   "testimonials": "creator voices",
   "Loved by teams that ": "Made for creators who ",
   "create content every day": "would rather be creating",
   "Loved by teams that create content every day": "Made for creators who would rather be creating",
   "From marketers and founders to agencies and growing teams — Verseo helps": "From solo YouTubers to managers and creator teams — Crevo helps",
   " people create better content faster, without sacrificing quality or consistency.": " people spend less time managing and more time creating.",
   "\"We tested several AI writing tools, but Verseo felt the most practical. It's fast, intuitive, and fits naturally into our workflow.\"": "\"My brand emails, DMs and comments live in five apps. I lose deals just because I see them too late.\"",
   "\"Verseo cut our content creation time in half. What used to take hours now takes minutes, and the quality is consistently high.\"": "\"I spend about three hours a day on admin: replies, captions for every platform, invoices. That is time I am not filming.\"",
   "\"The biggest win for us is consistency. Every email, post, and product update sounds like it comes from the same brand voice.\"": "\"Brands pay late and I forget to follow up. I need something that remembers who owes me what.\"",
   "Emma Rodriguez": "Maya (persona)",
   "Content Strategist": "YouTuber, 180k",
   "Sarah Chen": "Leo (persona)",
   "Marketing Manager": "Multi-platform creator",
   "David Miller": "Sana (persona)",
   "Startup Founder": "Creator, 60k",
   "4,9": "5 apps",
   "5,0": "3h/day"
  },
  "Pricing": {
   "Whether you’re creating content solo or collaborating with a team,": "Start free with your first deals and videos,",
   "there’s a plan designed for your workflow.": "and upgrade when your business grows.",
   "Whether you’re creating content solo or collaborating with a team, there’s a plan designed for your workflow.": "Start free with your first deals and videos, and upgrade when your business grows.",
   "For individuals and freelancers": "For creators landing first deals",
   "$12": "$0",
   "$29": "$19",
   "$79": "$49",
   "AI writing assistant": "Daily briefing",
   "Essential content templates": "Unified inbox for 1 platform",
   "Rewrite and improve text": "3 videos repurposed a month",
   "Standard support": "Manual deal tracking",
   "Pro": "Creator",
   "For creators and professionals": "For full-time creators",
   "Advanced AI generation": "All platforms connected",
   "Brand voice controls": "Unlimited repurposing",
   "Full template library": "Brand deal pipeline",
   "Priority content tools": "Invoices and payment chasing",
   "For agencies and growing teams": "For managers and creator teams",
   "Shared workspace": "Multiple creator workspaces",
   "Team collaboration tools": "Shared deal board",
   "Unlimited team projects": "Roles and approvals",
   "Get Started": "Get Started"
  },
  "FAQ": {
   "Whether you’re creating content solo or collaborating with a team,": "Questions about how Crevo reads your inbox,",
   "there’s a plan designed for your workflow.": "plans your day and acts for you.",
   "Whether you’re creating content solo or collaborating with a team, there’s a plan designed for your workflow.": "Questions about how Crevo reads your inbox, plans your day and acts for you.",
   "What is Verseo?": "What is Crevo?",
   "Verseo is an AI-powered writing assistant that helps you generate, rewrite, and improve content in seconds. From emails and social posts to product descriptions and marketing copy, it helps you create content faster with less effort.": "Crevo is an AI operating system for creators. It brings your inbox, brand deals, content, calendar and analytics into one place, gives you a daily briefing, and does the busywork - sorting messages, drafting replies, writing captions and chasing payments - so you spend more time creating.",
   "Who is Verseo designed for?": "Who is Crevo designed for?",
   "Do I need any writing experience?": "Will it post or send anything on its own?",
   "Can I customize the generated content?": "Which platforms does it work with?",
   "What types of content can I create?": "Where do the content ideas come from?",
   "How fast can I generate content?": "How much time will it save me?"
  }
 },
 "global": {
  "Verseo": "Crevo",
  "Get Template Free": "Sign up free",
  "better content today": "more, manage less",
  "Turn ideas into polished content in seconds. Generate, refine, and publish faster": "Your inbox, deals, content and schedule in one place. Wake up to a plan,",
  "with AI-powered workflows designed for modern teams.": "with the busywork already done.",
  "Turn ideas into polished content in seconds. Generate, refine, and publish faster with AI-powered workflows designed for modern teams.": "Your inbox, deals, content and schedule in one place. Wake up to a plan, with the busywork already done.",
  "Verseo helps teams create, refine, and publish high-quality content faster — without complicated workflows or endless revisions.": "Crevo brings a creator's inbox, content, brand deals and schedule into one place, and does the busywork so they can create.",
  "verseo@gmail.com": "hello@crevo.ai",
  "© 2026 Verseo | All Rights Reserved": "© 2026 Crevo | All Rights Reserved",
  "> Create a high-converting landing page ": "> Plan my day as a creator ",
  "→ analyzing audience ": "→ sorting 23 new messages ",
  "→ structuring content ": "→ checking brand deadlines ",
  "→ optimizing messaging ": "→ picking today's content ideas ",
  "+ compelling headline ": "+ 4 replies drafted ",
  "+ clear value proposition ": "+ Nike deliverable due Friday ",
  "+ conversion-focused copy ": "+ 3 content ideas for today ",
  "status: ready to publish ✓": "status: briefing ready ✓",
  "content_request: ": "request: ",
  "Get Started": "Get started free",
  "Try Demo": "See how it works"
 },
 "pages": {
  "/privacy-policy": {
   "Last updated: June 2026": "Last updated: 28 October 2026",
   "It is a legal document that explains how a website collects, uses, stores, and protects user data.": "How Crevo collects, uses and protects your data when you connect your inbox, calendar and channels.",
   "We collect both personal and non-personal information to improve our services and provide you with a seamless experience. This may include:": "We collect only what we need to run your workspace:",
   "Personal Information: Name, email address, phone number, billing information, and any other details you provide when contacting us or using our services.": "Account information: your name, email address and, on paid plans, billing details.",
   "Non-Personal Information: Browser type, device information, IP address, pages visited, and other analytics data collected automatically.": "Connected-account data: with your permission, read-only access to the Gmail, Google Calendar and YouTube data Crevo needs to sort messages, draft replies and plan your day, plus any metrics you import.",
   "Provide and improve our services.": "Build your daily briefing, sort your inbox and draft replies in your tone.",
   "Communicate with you regarding inquiries, projects, or support requests.": "Track brand deals, deadlines and payments, and suggest content ideas.",
   "Personalize your experience on our Website.": "Send the briefing email and the alerts you turn on.",
   "Improve Website functionality and security.": "Keep Crevo secure and fix problems.",
   "We do not sell or rent your personal information. However, we may share your information with:": "We never sell your data or use it for advertising. We share it only with:",
   "Service providers assisting us in operating our Website and business (e.g., payment processors, hosting providers).": "Service providers that run Crevo for us, such as hosting, email delivery, payments and AI model providers, under contracts that limit how they use it.",
   "We use cookies and similar tracking technologies to analyze website traffic and enhance user experience. You can control cookie preferences through your browser settings.": "We use a sign-in cookie to keep you signed in and to remember that you finished setup. Some settings are stored in your browser. You can clear both at any time in your browser settings.",
   "We implement industry-standard security measures to protect your personal information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.": "Connections are read-only where possible, data is encrypted in transit, and nothing is sent, posted or booked without your approval. No system is perfectly secure, so we can't guarantee absolute security.",
   "7. Termination": "7. Data Retention",
   "We reserve the right to terminate or suspend access to our Website or services at any time if a user violates these Terms of Service.": "We keep your data while your account is open. When you disconnect an account we stop syncing it, and when you delete your account we delete your data within 30 days unless the law requires us to keep it.",
   "Request data portability. To exercise these rights, contact us at [your email address].": "Request a copy of your data. To use any of these rights, email hello@crevo.ai.",
   "Our Website may contain links to third-party sites. We are not responsible for their privacy practices and encourage you to review their policies.": "Crevo connects to services such as Gmail, Google Calendar and YouTube. Their own privacy policies apply to the data they hold.",
   "Welcome to [Your Website Name] (\"we,\" \"our,\" \"us\"). Your privacy is important to us. This Privacy Policy outlines how we collect, use, disclose, and protect your information when you visit our website [yourwebsite.com] (the \"Website\"). By using the Website, you agree to the terms outlined in this Privacy Policy.": "This policy explains how Crevo (\"we,\" \"our,\" \"us\") collects, uses and protects your information when you use crevo.ai and the Crevo app. By using Crevo, you agree to this policy."
  },
  "/terms-of-service": {
   "Last updated: June 2026": "Last updated: 28 October 2026",
   "It is a legal agreement that outlines the rules, responsibilities, and expectations between a website, app, or service provider and its users.": "The rules for using Crevo: what we provide, what we ask of you, and what each of us is responsible for.",
   "We provide brand design services, including but not limited to logo design, brand strategy, and visual identity development. Our services may change or be updated from time to time at our discretion.": "Crevo is an AI assistant for creators. It connects to accounts you choose, such as Gmail, Google Calendar and YouTube, to sort messages, draft replies, track brand deals, repurpose videos and plan your schedule. Features may change as we improve the product.",
   "By using our Website, you agree that you will not:": "By using Crevo, you agree that you will not:",
   "Attempt to hack, disrupt, or modify our Website.": "Attempt to hack, overload or disrupt Crevo.",
   "Use our content or designs without permission.": "Use Crevo to send spam or to post content you don't have the rights to.",
   "Refunds are only granted under specific circumstances, subject to our review.": "Paid plans renew monthly until you cancel, and you can cancel at any time in Settings.",
   "All payments for services must be made as per the agreed terms before work commences.": "Fees are charged in advance for each billing period. Refunds are handled case by case.",
   "Late payments may result in service delays or termination.": "If a payment fails, paid features may pause until it is resolved.",
   "Clients receive rights to use the final design as outlined in the agreed contract.": "You own your content, including your videos, captions and the replies you approve.",
   "We retain ownership of all preliminary design work until final payment is received.": "You give us permission to process your content only to provide Crevo to you.",
   "You may not resell, modify, or claim ownership of any work without our permission.": "Crevo itself, including its software and design, belongs to us.",
   "We are not liable for any damages, including lost profits or data, resulting from the use of our Website or services. We do not guarantee that our Website will be error-free or uninterrupted.": "AI suggestions can be wrong, so review drafts, captions and extracted contract terms before you approve them. Crevo never sends, posts or signs anything without your approval. To the extent the law allows, we are not liable for indirect losses such as lost profits, and we don't guarantee the service will be uninterrupted or error-free.",
   "We reserve the right to terminate or suspend access to our Website or services at any time if a user violates these Terms of Service.": "We may suspend or close an account that breaks these terms. You can delete your account at any time.",
   "We may update these Terms from time to time. Continued use of the Website after changes are posted constitutes acceptance of the revised Terms.": "We may update these terms. We'll tell you about important changes by email, and continuing to use Crevo after that means you accept them.",
   "Welcome to [Your Website Name] (\"we,\" \"our,\" \"us\"). By accessing and using our website [yourwebsite.com] (the \"Website\") and services, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use our Website.": "These terms apply when you use crevo.ai and the Crevo app (\"Crevo,\" \"we,\" \"our,\" \"us\"). By using Crevo, you agree to them. If you don't agree, please don't use Crevo."
  },
  "/contact-us": {
   "Have a question, want to see Verseo in action, or need help choosing the right workflow? Send us a note and we’ll get back to you soon.": "Have a question, want to see Crevo in action, or need help connecting your accounts? Send us a note and we’ll get back to you soon.",
   "Tell us what you’re building": "Tell us about your channel",
   "Share a few details and the Verseo team will point you toward the fastest way to create, refine, and publish better content.": "Share a few details and the Crevo team will help you set up your briefing, inbox and deal tracking.",
   "verseo@gmail.com": "hello@crevo.ai"
  }
 }
};

  // Each page's title; Framer's runtime resets it to the template's.
  var TITLES = {
    "/": "Crevo — The AI Operating System for Creators",
    "/privacy-policy": "Privacy Policy — Crevo",
    "/terms-of-service": "Terms of Service — Crevo",
    "/contact-us": "Contact Crevo",
    "/404": "Page Not Found — Crevo"
  };
  var PATH = location.pathname.replace(/\/+$/, "") || "/";
  var TITLE = TITLES[PATH] || (document.title.indexOf("Not Found") !== -1 ? TITLES["/404"] : TITLES["/"]);
  // Page text and map keys are compared in a normalised form: trimmed, runs of
  // whitespace collapsed and curly quotes made straight. Some template lines end
  // in a space (the first half of a two-line heading), and text that only
  // Framer's runtime renders was copied from screenshots, so spacing and quote
  // style can differ from the live page.
  var norm = function (s) {
    return s.replace(/\u00a0/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...").replace(/\s+/g, " ").trim();
  };
  function trimmed(src) {
    var m = {};
    Object.keys(src).forEach(function (k) { m[norm(k)] = src[k].trim(); });
    return m;
  }
  var globalMap = trimmed(COPY.global);
  // Copy that only applies on one page (the legal pages share section names
  // but need different text), checked before the section maps.
  var pageMap = COPY.pages && COPY.pages[PATH] ? trimmed(COPY.pages[PATH]) : {};
  var sectionMaps = {};
  Object.keys(COPY.sections).forEach(function (name) {
    var m = trimmed(COPY.sections[name]);
    Object.keys(globalMap).forEach(function (k) { if (!(k in m)) m[k] = globalMap[k]; });
    sectionMaps[name] = m;
  });

  function mapFor(node) {
    var el = node.parentElement;
    while (el) {
      var name = el.getAttribute && el.getAttribute("data-framer-name");
      if (name && sectionMaps[name]) return sectionMaps[name];
      el = el.parentElement;
    }
    return globalMap;
  }

  function fixText(node) {
    var raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    if (node.parentElement && node.parentElement.tagName === "TITLE") {
      if (raw.indexOf("Verseo") !== -1) node.nodeValue = TITLE;
      return;
    }
    var key = norm(raw);
    var next = key in pageMap ? pageMap[key] : mapFor(node)[key];
    if (next === undefined && raw.indexOf("Verseo") !== -1) next = raw.trim().replace(/Verseo/g, "Crevo");
    if (next === undefined) return fixFaqAnswer(node);
    if (next === raw.trim()) return;
    var lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + next + trail;
  }

  // Images are matched by the width and height attributes Framer gives them,
  // which stay the same when its runtime re-renders the page with its own URLs.
  var HERO_SRCSET = "/assets/img/crevo-hero-512.webp 512w, /assets/img/crevo-hero-1024.webp 1024w, /assets/img/crevo-hero-2048.webp 2048w, /assets/img/crevo-hero-2151.webp 2151w";
  var IMAGES = {
    "Hero": { "2151x720": { src: "/assets/img/crevo-hero-2151.webp", srcset: HERO_SRCSET } },
    "Integrations": {
      "127x44": { src: "/assets/img/crevo-tool-canva.png" },
      "145x37": { src: "/assets/img/crevo-tool-notion.png" },
      "163x37": { src: "/assets/img/crevo-tool-slack.png" },
      "182x38": { src: "/assets/img/crevo-tool-drive.png" },
      "136x37": { src: "/assets/img/crevo-tool-stripe.png" },
      "180x37": { src: "/assets/img/crevo-tool-dropbox.png" }
    },
    "Examples": {},
    "How It Works": { "1040x530": { src: "/assets/img/crevo-step1-1040.webp", srcset: "/assets/img/crevo-step1-512.webp 512w, /assets/img/crevo-step1-1024.webp 1024w, /assets/img/crevo-step1-1040.webp 1040w, /assets/img/crevo-step1-2080.webp 2080w" } },
    "Client Logos": {
      "294x81": { src: "/assets/img/crevo-logo-youtube.png" },
      "268x83": { src: "/assets/img/crevo-logo-instagram.png" },
      "224x88": { src: "/assets/img/crevo-logo-tiktok.png" },
      "286x81": { src: "/assets/img/crevo-logo-gmail.png" },
      "252x83": { src: "/assets/img/crevo-logo-calendar.png" }
    }
  };

  // The three example images share one size, so they are matched by alt text
  // (the template's alt, which Framer's runtime restores, or ours).
  var IMAGES_BY_ALT = {
    "AI writing workflow interface for generating polished content": { src: "/assets/img/crevo-ex-briefing-756.webp", srcset: "/assets/img/crevo-ex-briefing-512.webp 512w, /assets/img/crevo-ex-briefing-756.webp 756w, /assets/img/crevo-ex-briefing-1512.webp 1512w" },
    "Crevo morning briefing with today's to-dos and a content idea": { src: "/assets/img/crevo-ex-briefing-756.webp", srcset: "/assets/img/crevo-ex-briefing-512.webp 512w, /assets/img/crevo-ex-briefing-756.webp 756w, /assets/img/crevo-ex-briefing-1512.webp 1512w" },
    "Content automation dashboard showing workflow controls and results": { src: "/assets/img/crevo-ex-reply-756.webp", srcset: "/assets/img/crevo-ex-reply-512.webp 512w, /assets/img/crevo-ex-reply-756.webp 756w, /assets/img/crevo-ex-reply-1512.webp 1512w" },
    "Crevo reply draft to a brand partner, waiting for approval": { src: "/assets/img/crevo-ex-reply-756.webp", srcset: "/assets/img/crevo-ex-reply-512.webp 512w, /assets/img/crevo-ex-reply-756.webp 756w, /assets/img/crevo-ex-reply-1512.webp 1512w" },
    "Verseo content workspace preview with AI-generated outputs": { src: "/assets/img/crevo-ex-posted-756.webp", srcset: "/assets/img/crevo-ex-posted-512.webp 512w, /assets/img/crevo-ex-posted-756.webp 756w, /assets/img/crevo-ex-posted-1512.webp 1512w" },
    "Crevo schedule posting one clip as a Reel, Short and TikTok": { src: "/assets/img/crevo-ex-posted-756.webp", srcset: "/assets/img/crevo-ex-posted-512.webp 512w, /assets/img/crevo-ex-posted-756.webp 756w, /assets/img/crevo-ex-posted-1512.webp 1512w" }
  };

  function sectionOf(el) {
    while (el) {
      var name = el.getAttribute && el.getAttribute("data-framer-name");
      if (name && IMAGES[name]) return name;
      el = el.parentElement;
    }
    return null;
  }

  function fixImg(img) {
    var section = sectionOf(img);
    if (!section) return;
    var want = section === "Examples" ? IMAGES_BY_ALT[img.getAttribute("alt")] : IMAGES[section][img.getAttribute("width") + "x" + img.getAttribute("height")];
    if (!want) return;
    if (want.srcset && img.getAttribute("srcset") !== want.srcset) img.setAttribute("srcset", want.srcset);
    if (!want.srcset && img.hasAttribute("srcset")) img.removeAttribute("srcset");
    if (img.getAttribute("src") !== want.src) img.setAttribute("src", want.src);
  }

  // Button links, which Framer's runtime would reset to the template's own.
  var SIGNUP = "/auth/signup";
  function hide(el) {
    if (el.style.display !== "none") el.style.display = "none";
  }

  function fixLink(a) {
    var href = a.getAttribute("href") || "", want = null;
    var toContact = href.indexOf("contact-us") !== -1;
    var role = a.getAttribute("data-framer-name");
    // Template credits and the template's 404 demo link don't belong in the footer.
    if (href.indexOf("framer.link/yulia95") !== -1 || href.indexOf("tvorbadesign.com") !== -1) return hide(a);
    if (/(^|\/)404$/.test(href)) return hide(a.closest("p") || a);
    if (href.indexOf("framer.link/") !== -1) want = SIGNUP;
    else if (href.indexOf("x.com/YTsyhanenko") !== -1) want = "https://x.com/";
    else if (href === "mailto:verseo@gmail.com") want = "mailto:hello@crevo.ai";
    else if (toContact && (a.closest('[data-framer-name="Results"]') || a.closest('[data-framer-name="Pricing"]'))) want = SIGNUP;
    else if (role === "Primary" && (toContact || a.closest('[data-framer-name="Hero"]'))) want = SIGNUP;
    else if (role === "Secondary" && (toContact || a.closest('[data-framer-name="Hero"]'))) want = "./#how-it-works";
    if (want && href !== want) a.setAttribute("href", want);
    if (want === SIGNUP && a.getAttribute("target") === "_blank") a.removeAttribute("target");
  }

  // The footer newsletter form is wired to the template's Framer form service,
  // which would send visitors' emails to the template author. Send them to
  // sign-up instead, with the email filled in.
  // The Contact page's form posts there too, so it opens an email to the
  // team with the visitor's message instead.
  window.addEventListener("submit", function (e) {
    var form = e.target;
    var input = form && form.querySelector && form.querySelector('input[type="email"]');
    if (!input) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (form.getAttribute("data-framer-name") === "Contact Form") {
      var value = function (sel) { var el = form.querySelector(sel); return el ? el.value.trim() : ""; };
      // Exact names: the form also has hidden spam-trap fields.
      var name = value('input[name="Full Name"]');
      var subject = value('input[name="Subject"]') || "Hello from the Crevo site";
      var body = value("textarea") + "\n\n— " + (name || "") + (input.value ? " (" + input.value + ")" : "");
      location.href = "mailto:hello@crevo.ai?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      return;
    }
    location.href = SIGNUP + "?email=" + encodeURIComponent(input.value);
  }, true);

  function fixInput(input) {
    if (input.getAttribute("placeholder") === "jane@framer.com") input.setAttribute("placeholder", "you@example.com");
  }

  // FAQ answers that only Framer's runtime renders. The template's wording isn't
  // known, so each answer is found by the question in the same FAQ item.
  var FAQ_ANSWERS = {
    "What is Crevo?": "Crevo is an AI operating system for creators. It brings your inbox, brand deals, content, calendar and analytics into one place, gives you a daily briefing, and does the busywork - sorting messages, drafting replies, writing captions and chasing payments - so you spend more time creating.",
    "Who is Crevo designed for?": "Creators who run their own business: full-time YouTubers, Instagram and TikTok creators, and the managers and small teams who work with them. If you juggle brand deals, an inbox and a posting schedule, it's built for you.",
    "Will it post or send anything on its own?": "No. Crevo prepares replies, captions, invoices and calendar events, but nothing is sent, posted or booked until you approve it. Emails are saved as drafts in your Gmail.",
    "Which platforms does it work with?": "Gmail, Google Calendar, Google Drive and YouTube connect directly. Instagram and TikTok work through imports for now, and posts for every platform are prepared and scheduled from one board.",
    "Where do the content ideas come from?": "From your own audience and numbers: questions people repeat in your comments, the formats and topics that perform best for you, and the niche and goals you set. Every idea shows why it was picked.",
    "How much time will it save me?": "It depends on how much you post, but sorting messages, drafting replies, writing captions for each platform and chasing payments add up to hours every week. Your daily briefing shows the time Crevo has saved you."
  };
  var FAQ_QUESTIONS = Object.keys(FAQ_ANSWERS);

  function fixFaqAnswer(node) {
    var text = norm(node.nodeValue || "");
    if (text.length < 40 || FAQ_ANSWERS[text] !== undefined) return;
    var el = node.parentElement, faq = null;
    while (el && !faq) {
      var name = el.getAttribute && el.getAttribute("data-framer-name");
      if (name === "FAQ") faq = el;
      el = el.parentElement;
    }
    if (!faq) return;
    for (el = node.parentElement; el && el !== faq; el = el.parentElement) {
      var all = norm(el.textContent), found = [];
      FAQ_QUESTIONS.forEach(function (q) { if (all.indexOf(q) !== -1) found.push(q); });
      if (found.length > 1) return;
      if (found.length === 1) {
        var answer = FAQ_ANSWERS[found[0]];
        if (text !== answer && text !== found[0]) node.nodeValue = answer;
        return;
      }
    }
  }

  function fixAnchors() {
    var how = document.querySelector('[data-framer-name="How It Works"]');
    if (how && !document.getElementById("how-it-works")) how.id = "how-it-works";
  }

  function fixTree(root) {
    if (root.nodeType === 3) return fixText(root);
    if (root.nodeType !== 1) return;
    if (root.tagName === "IMG") return fixImg(root);
    if (root.tagName === "A") fixLink(root);
    if (root.tagName === "INPUT") return fixInput(root);
    var inputs = root.getElementsByTagName("input");
    for (var k = 0; k < inputs.length; k++) fixInput(inputs[k]);
    var links = root.getElementsByTagName("a");
    for (var j = 0; j < links.length; j++) fixLink(links[j]);
    var imgs = root.getElementsByTagName("img");
    for (var i = 0; i < imgs.length; i++) fixImg(imgs[i]);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) fixText(n);
  }

  function fixTitle() {
    if (document.title && document.title.indexOf("Verseo") !== -1) document.title = TITLE;
  }

  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.type === "characterData") fixText(r.target);
      else if (r.type === "attributes") {
        if (r.target.tagName === "A") fixLink(r.target);
        else if (r.target.tagName === "INPUT") fixInput(r.target);
        else fixImg(r.target);
      }
      else r.addedNodes.forEach(fixTree);
    });
    fixTitle();
    fixAnchors();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["src", "srcset", "href", "placeholder"] });

  // Framer's runtime navigates on click from its own copy of each link's
  // target (the template's contact page), ignoring the href fixLink set. Catch
  // clicks on the sign-up and "how it works" buttons first (capture phase,
  // before React's handlers) and go where the button says.
  var TO_SIGNUP = /^(get started( free)?|start creating|sign up( free)?|get template)$/i;
  var TO_HOW = /^(see how it works|try demo)$/i;
  function labelOf(a) {
    // Framer renders each label twice (for its hover effect); use one copy.
    var text = (a.textContent || "").replace(/\s+/g, " ").trim();
    var twice = text.match(/^(.+?) ?\1$/);
    return twice ? twice[1] : text;
  }
  window.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a || a.closest("form")) return;
    var label = labelOf(a), dest = null;
    if (TO_SIGNUP.test(label)) dest = SIGNUP;
    else if (TO_HOW.test(label)) dest = "/#how-it-works";
    if (!dest) return;
    a.setAttribute("href", dest);
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab or window: the browser uses the href
    e.preventDefault();
    e.stopImmediatePropagation();
    if (dest.charAt(0) === "/" && dest.indexOf("#") > 0 && location.pathname === "/") {
      var target = document.getElementById(dest.split("#")[1]);
      if (target) return target.scrollIntoView({ behavior: "smooth" });
    }
    location.href = dest;
  }, true);

  document.addEventListener("DOMContentLoaded", function () { fixTree(document.body); fixTitle(); fixAnchors(); });
})();
