import type { LeverCatalogEntry } from "./catalog";
import type { StarterPlanStep } from "./starter-plan";

type GuideCopy = {
  explanation: string;
  estTimeLabel: string;
};

type StarterStepCopy = Pick<StarterPlanStep, "title" | "detail">;

export const EN_LEVER_GUIDE_COPY: Record<string, GuideCopy> = {
  lead_magnet: {
    explanation:
      "A lead magnet is a free resource such as a PDF, mini-course, checklist or audit. People exchange their email address for it. It gives you a way to follow up with visitors who are not ready to buy.\n\nThe best lead magnet solves one specific problem for your ideal customer, takes less than 15 minutes to use and points naturally to your offer.\n\nIn practice, it could be a checklist such as \"5 mistakes blocking your clients\" or a short audit that gives someone a first result and shows them what to do next.",
    estTimeLabel: "2 to 4h",
  },
  email_marketing: {
    explanation:
      "Email marketing is a regular way to stay in touch with your list. Start with a welcome sequence, then send messages that share useful information and make offers. Once it is set up, email lets you reach people who have already given you their address without paying for another visit.\n\nMost people do not buy at the first touch. Regular emails keep your offer familiar until they are ready. A good welcome sequence can also generate sales without manual follow-up.\n\nIn practice: 3 to 5 automated emails after signup, then weekly or biweekly emails with useful content and reminders about your offer.",
    estTimeLabel: "3 to 5h for the welcome sequence",
  },
  newsletter: {
    explanation:
      "A newsletter is a recurring weekly or biweekly message that keeps you in touch with your list outside automated sequences. Share what you are learning, what you see with clients or your view of the market.\n\nRegular contact keeps your offer familiar between launches. Without it, people may forget you before the next sales email.\n\nIn practice: one short email each week with an idea, observation or useful link, plus an occasional reminder of your offer.",
    estTimeLabel: "1 to 2h per week",
  },
  seo_blog: {
    explanation:
      "Blog and SEO content answer questions prospects type into Google on your own site. A useful article can keep attracting visitors for months or years.\n\nUnlike a social post that disappears quickly, an article can keep bringing in search traffic after publication and show prospects what you know.\n\nIn practice: one article answering a specific question, optimized for the search term and linked to your lead magnet or offer.",
    estTimeLabel: "3 to 6 months before the first organic results",
  },
  podcast: {
    explanation:
      "A podcast is a regular audio format, solo or interview-based, where you can develop ideas in depth. It gives people more time with your thinking than a post or short video.\n\nLong-form audio helps listeners become familiar with your work. Interviews can also introduce you to your guests' audiences.\n\nIn practice: a weekly or biweekly format published on listening platforms and reused as short clips for social media.",
    estTimeLabel: "3 to 5h per episode",
  },
  retargeting: {
    explanation:
      "Retargeting shows ads to people who visited your site, sales page or videos but did not convert. It focuses on people who already know something about your offer.\n\nMany visitors do not convert on their first visit. Retargeting gives you another chance to address an objection or remind them what you offer.\n\nIn practice: install a pixel, create an audience of recent visitors and run a small-budget ad.",
    estTimeLabel: "1 to 2h to set up",
  },
  referral: {
    explanation:
      "A referral system encourages current customers to recommend you, with or without a reward such as a bonus or renewal discount. It turns customer satisfaction into an acquisition source you can measure instead of relying only on word of mouth.\n\nSomeone referred by a trusted customer starts with more confidence than someone who sees a new ad, and acquisition cost is usually low.\n\nIn practice: ask at the right moment, just after a result or testimonial, with a simple question and an optional reward.",
    estTimeLabel: "30 min to set up the process",
  },
  ads: {
    explanation:
      "Paid advertising buys visibility on Meta, Google, TikTok or LinkedIn instead of relying only on organic reach. It can increase volume once your funnel converts, but it also spends cash quickly when your closing process is not solid.\n\nUse it to increase acquisition without adding more content. If you pay for leads you cannot convert, the test becomes expensive.\n\nIn practice: start with a modest test budget on one channel and one clear offer. Track cost per lead so you can scale or stop.",
    estTimeLabel: "1 to 2 weeks for the first campaign",
  },
  vsl: {
    explanation:
      "A VSL (Video Sales Letter) is a structured sales video, usually 10 to 30 minutes long, that presents your offer, handles the main objections and leads viewers to take action.\n\nIt works around the clock, pre-qualifies prospects before a sales call and can improve both booking rate and lead quality.\n\nIn practice: your story, the unique mechanism or method you offer, social proof and a clear call to action toward booking or buying.",
    estTimeLabel: "1 to 2 weeks (script and recording)",
  },
  webinar: {
    explanation:
      "A webinar is a live or semi-live session where you teach something concrete for 45 to 90 minutes and present your offer at the end. It combines teaching and selling in one session.\n\nA live session gives you more room for questions and a timely offer than an email or post. People who stay to the end have already invested time and may be more likely to buy.\n\nIn practice: a specific result promise, a teaching segment that gives a real win and an offer with a deadline or time-limited bonus.",
    estTimeLabel: "1 week (preparation + presentation)",
  },
  sequence_relance_non_acheteurs: {
    explanation:
      "A non-buyer follow-up sequence is an automated series sent to people who showed interest but did not buy: they opted in, booked a call or visited your sales page. Instead of disappearing, they hear a different angle that handles an objection or adds proof.\n\nMany sales do not happen on the first contact. A reminder and one more useful argument can recover revenue you had almost earned.\n\nIn practice: 3 to 5 automated emails over the days after an unconcluded call or an unpurchased sales-page visit, each addressing a different objection.",
    estTimeLabel: "2 to 3h for the sequence",
  },
  order_bump: {
    explanation:
      "An order bump is a complementary offer shown at checkout, often as a checkbox before the main purchase is completed. The buying decision has already been made, so it is the easiest moment to increase average order value.\n\nIt adds revenue without another sales call or script, especially when the add-on is low-priced and directly related to the main offer.\n\nIn practice: a small guide, template or bonus with one clear benefit, displayed on the payment page.",
    estTimeLabel: "1h to set up",
  },
  downsell: {
    explanation:
      "A downsell is a lower-priced or lighter alternative offered after someone refuses your main offer. It captures some decisions based on price or commitment that would otherwise become zero revenue.\n\nA well-designed downsell recovers part of the value already created by the conversation without weakening the main offer.\n\nIn practice: a shorter engagement, fewer modules or less support, offered immediately after a refusal in a call or on the checkout page.",
    estTimeLabel: "1 to 2h to define the offer",
  },
  garantie: {
    explanation:
      "A guarantee is a clear commitment on your sales page or during a call, such as a refund, result guarantee or trial period. It reduces the prospect's perceived risk.\n\nThe concern is often \"what if this does not work for me?\". A precise guarantee moves part of that risk away from the buyer and can help them decide.\n\nIn practice: one specific sentence shown clearly on the sales page and repeated during the call.",
    estTimeLabel: "30 min to formulate",
  },
  preuve_sociale_page: {
    explanation:
      "Social proof on a sales page includes testimonials, quantified results, reviews and logos that show prospects that people like them already achieved what you promise.\n\nNobody wants to be the first person to test an offer. Specific proof reduces hesitation, especially when the price or commitment is significant.\n\nIn practice: 3 to 5 precise testimonials with a concrete result, ideally with a photo or video, placed near key decision points on the page.",
    estTimeLabel: "1 to 2h to collect and add them",
  },
  upsell_ascension: {
    explanation:
      "An upsell is a more complete, more supported or more advanced offer proposed to someone who has already bought or is already a customer. It is one of the best effort-to-revenue levers because you sell to someone who already trusts you.\n\nIncreasing the average value of existing customers costs much less than acquiring a new one, and trust is highest just after a purchase or a customer win.\n\nIn practice: define a clear VIP, advanced or complementary offer and propose it at the right moment after the main sale or first result.",
    estTimeLabel: "3 to 5h to define the offer and script",
  },
  onboarding_structure: {
    explanation:
      "Onboarding structure is what a customer experiences in the first days after purchase: access to resources, a welcome message or call and clear expectations. It determines whether they start with confidence or confusion.\n\nA clear onboarding reduces early drop-off and refunds. Customers who know what to do start faster and are more likely to stay and provide a testimonial.\n\nIn practice: an automatic welcome message, one central resource hub and one clear first action within 48 hours.",
    estTimeLabel: "2 to 4h to structure the process",
  },
  collecte_temoignages_systematique: {
    explanation:
      "Systematic testimonial collection is a repeatable process that asks for customer feedback at key moments instead of waiting for customers to remember on their own.\n\nSocial proof helps, but it gets stale when it depends on a few testimonials reused everywhere. A regular process gives you current proof that matches your offer.\n\nIn practice: send a request after a milestone with two or three guided questions rather than an open \"what did you think?\" prompt.",
    estTimeLabel: "1h to set up the process",
  },
  communaute_clients: {
    explanation:
      "A customer community is a dedicated space such as a private group, forum or Discord/Slack server. Customers can exchange, ask questions and help one another in addition to direct support.\n\nAn active community improves retention and reduces one-to-one support load. Customer wins also motivate the rest of the group.\n\nIn practice: start with a simple platform, a few rules and regular participation until the community runs with less input.",
    estTimeLabel: "1 to 2h to set up, then regular presence",
  },
  reactivation_anciens_clients: {
    explanation:
      "Reactivation means contacting past customers who are no longer active or have not bought again, with a renewal, a new offer or a genuine check-in.\n\nThey already know you and have already paid you, so the trust-building cost is close to zero compared with a new prospect.\n\nIn practice: send a personal message that asks how they are doing and offers the next relevant step for where they are now.",
    estTimeLabel: "1 to 2h for the first reactivation campaign",
  },
};

const EN_STARTER_PLAN_COPY: Record<string, Record<number, StarterStepCopy>> = {
  email_marketing: {
    1: { title: "Choose an email marketing tool", detail: "MailerLite, ConvertKit or Brevo are good places to start. They are free or inexpensive for a few thousand contacts." },
    2: { title: "Define your welcome sequence (Falco can help write it)", detail: "Create 3 to 5 automated emails: explain who you are, the result you help clients reach, share a client story and make your offer." },
    3: { title: "Send your first email", detail: "Email your current list, even if it is small. Sending teaches you what works." },
    4: { title: "Record your first numbers", detail: "Enter sends, opens and clicks in Newsletter so Falco can track your progress." },
  },
  ads: {
    1: { title: "Define the offer and test budget", detail: "Choose one offer and a modest budget you are willing to spend to learn." },
    2: { title: "Create your first campaign", detail: "Start with one channel and one creative angle to test." },
    3: { title: "Record your first numbers", detail: "Enter spend, leads and results in Ads to track your real cost per lead." },
  },
  upsell_ascension: {
    1: { title: "Choose the supporting offer", detail: "Identify the main offer that the upsell will follow." },
    2: { title: "Define the complementary offer in Products", detail: "Choose a coherent VIP programme, advanced support or add-on module." },
    3: { title: "Prepare your proposal script (Falco can help)", detail: "Write a few natural sentences to propose the upsell without pressure." },
    4: { title: "Make your first upsell offer", detail: "Offer it to your next customer and record whether they accepted it in Sales tracking." },
  },
  vsl: {
    1: { title: "Write the script (Falco can help)", detail: "Structure your story, unique method, social proof and call to action." },
    2: { title: "Record the video", detail: "A phone camera and a good microphone are enough to start. The content matters most." },
    3: { title: "Edit and host the video", detail: "Use a simple edit with cuts and subtitles, then host it on YouTube unlisted or Vimeo." },
    4: { title: "Add the VSL to your funnel", detail: "Place it before booking or on the sales page, with a clear call to action after viewing." },
  },
  lead_magnet: {
    1: { title: "Choose the format and topic", detail: "Pick a checklist, PDF or mini-course that solves one precise problem for your ideal customer." },
    2: { title: "Create the content and opt-in page", detail: "It should be consumable in under 15 minutes and deliver one concrete first result." },
    3: { title: "Connect it to email and publish", detail: "Connect the page to your email tool so signups are captured automatically." },
  },
  webinar: {
    1: { title: "Define the promise and topic", detail: "Choose a precise result strong enough to make people want to register." },
    2: { title: "Build the session outline", detail: "Teach something that delivers a real result, then transition naturally to your offer." },
    3: { title: "Prepare the closing offer (Falco can help)", detail: "Use a deadline or limited-time bonus to help people make a decision." },
    4: { title: "Schedule and promote the session", detail: "Choose a date, open registration and remind attendees the day before." },
  },
  newsletter: {
    1: { title: "Choose a sustainable cadence", detail: "Weekly is easier to maintain than biweekly. Consistency matters more than volume." },
    2: { title: "Define a simple repeatable format", detail: "Share one idea or observation per email, not a full article." },
    3: { title: "Write and send the first three issues", detail: "The goal is to build the habit, not to be perfect on the first send." },
  },
  seo_blog: {
    1: { title: "List 5 to 10 questions your prospects ask", detail: "Your discovery calls and messages are often the best source of topics." },
    2: { title: "Choose the first topic and check demand", detail: "Google suggestions or Keyword Planner are enough to get started." },
    3: { title: "Write and publish your first article", detail: "Answer the question in the first paragraph, then develop the details." },
    4: { title: "Publish one article per month", detail: "SEO rewards consistency over a single burst of content." },
  },
  podcast: {
    1: { title: "Define the format and frequency", detail: "Choose a solo, interview or mixed format you can sustain." },
    2: { title: "Get the minimum equipment", detail: "A decent microphone and free recording software are enough to start." },
    3: { title: "Record and publish the first three episodes", detail: "Distribute them on Spotify and Apple Podcasts through a host such as Acast or Buzzsprout." },
    4: { title: "Repurpose clips for social media", detail: "A strong moment from an episode can attract new listeners." },
  },
  retargeting: {
    1: { title: "Install the tracking pixel", detail: "Place it on your sales page and site so you can build a retargeting audience." },
    2: { title: "Create a retargeting audience", detail: "Recent visitors who did not buy are a good starting audience." },
    3: { title: "Launch a small-budget campaign", detail: "A small daily budget is enough to start reaching this warm audience." },
    4: { title: "Track cost per result", detail: "Compare it with cold acquisition campaigns. Retargeting should normally perform better." },
  },
  referral: {
    1: { title: "Define when you will ask", detail: "Ask just after a customer result or positive testimonial, when the recommendation feels natural." },
    2: { title: "Prepare one simple sentence", detail: "A short direct request works better than a long pitch." },
    3: { title: "Decide on an optional reward", detail: "A discount, bonus or free access can increase referrals." },
    4: { title: "Start asking consistently", detail: "Add the question to your customer follow-up routine." },
  },
  sequence_relance_non_acheteurs: {
    1: { title: "List the most common objections", detail: "Use the objections you hear in calls and messages from hesitant prospects." },
    2: { title: "Write the sequence (Falco can help)", detail: "Create 3 to 5 emails over 5 to 7 days, each handling a different objection." },
    3: { title: "Automate the sequence", detail: "Trigger it after an unconcluded call or an unpurchased sales-page visit." },
    4: { title: "Track recovered sales", detail: "Record them in Sales tracking to measure the sequence's real impact." },
  },
  order_bump: {
    1: { title: "Choose a low-priced add-on", detail: "Pick something easy to consume and clearly connected to the main offer." },
    2: { title: "Write one clear benefit sentence", detail: "A checkbox is decided in seconds, so the benefit must be instantly clear." },
    3: { title: "Add it to the checkout page", detail: "Most sales tools let you add an order bump directly at checkout." },
  },
  downsell: {
    1: { title: "Identify price or commitment objections", detail: "These refusals are the best candidates for a downsell." },
    2: { title: "Define a lighter version of your offer", detail: "Reduce modules, support or commitment while keeping the value clear." },
    3: { title: "Prepare the transition sentence", detail: "Offer it after the refusal without making the main offer look discounted." },
    4: { title: "Test it on your next refusal", detail: "Record the result in Sales tracking to see whether it converts." },
  },
  garantie: {
    1: { title: "Choose the type of guarantee", detail: "Select a refund, conditional result guarantee or trial period you can stand behind." },
    2: { title: "Write the exact sentence (Falco can help)", detail: "It should be precise. Vague guarantees create doubt." },
    3: { title: "Show it on the sales page and in calls", detail: "A guarantee seen once loses much of its reassuring effect." },
  },
  preuve_sociale_page: {
    1: { title: "Collect your existing testimonials", detail: "Customer messages, reviews and shared results are probably already available." },
    2: { title: "Ask for two or three more if needed", detail: "Ask for a specific result rather than a general opinion." },
    3: { title: "Add them to your sales page", detail: "Place them near key decision points, before the purchase button." },
  },
  onboarding_structure: {
    1: { title: "List the questions new customers ask", detail: "They reveal what is missing from your current onboarding." },
    2: { title: "Write the welcome message (Falco can help)", detail: "Include resource access, clear expectations and a first action within 48 hours." },
    3: { title: "Centralize access", detail: "Use one resource hub instead of scattered links customers must find themselves." },
    4: { title: "Define the first high-value action", detail: "Choose something simple that creates a quick win in the first few days." },
  },
  collecte_temoignages_systematique: {
    1: { title: "Choose when to ask", detail: "The end of an engagement or a visible result are natural moments." },
    2: { title: "Prepare two or three guided questions", detail: "They produce more useful answers than an open-ended request." },
    3: { title: "Automate the request", detail: "Schedule an email or message at the right moment instead of relying on memory." },
    4: { title: "Centralize the testimonials you receive", detail: "Keep them in one place so they are easy to find when building a sales page." },
  },
  communaute_clients: {
    1: { title: "Choose the platform", detail: "Pick Facebook, Skool or Discord based on where your audience already spends time." },
    2: { title: "Define three to five simple rules", detail: "Set a welcoming frame without making exchanges rigid." },
    3: { title: "Launch with a topic or introduction", detail: "Set the tone and invite each member to introduce themselves." },
    4: { title: "Be present regularly at first", detail: "Early active facilitation helps the community run without constant input." },
  },
  reactivation_anciens_clients: {
    1: { title: "List inactive past customers", detail: "Include people who have not bought again or been in touch for several months." },
    2: { title: "Define what is new to offer them", detail: "This could be a follow-on offer, an update or a genuine check-in." },
    3: { title: "Send a personal message", detail: "A message that shows you remember them converts better than a generic broadcast." },
    4: { title: "Track recovered sales", detail: "Record them in Sales tracking to measure the real impact of reactivation." },
  },
};

export function localizeGuideEntry(entry: LeverCatalogEntry, locale: string): LeverCatalogEntry {
  if (locale !== "en") return entry;
  const copy = EN_LEVER_GUIDE_COPY[entry.leverKey];
  return copy ? { ...entry, explanation: copy.explanation, estTimeLabel: copy.estTimeLabel } : entry;
}

export function localizeStarterPlan(plan: StarterPlanStep[] | null, leverKey: string, locale: string): StarterPlanStep[] | null {
  if (locale !== "en" || !plan) return plan;
  const copies = EN_STARTER_PLAN_COPY[leverKey];
  if (!copies) return plan;
  return plan.map((step) => ({ ...step, ...(copies[step.order] ?? {}) }));
}
