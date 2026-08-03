// One-off seed for the `lever_resources` table (lib/levers/resources.ts) —
// curated YouTube videos shown on /demarrer/[leverKey]'s "Apprends en
// vidéo" section. Same pattern as scripts/seed-levers-catalog.mjs: plain
// .mjs, run via `node scripts/seed-lever-resources.mjs` against .env.local,
// idempotent via full delete+reinsert (not an upsert).
//
// Was deliberately seeded EMPTY at launch — the "Démarrer un levier" brief
// is explicit: no automatic YouTube search, only manually curated, verified
// links (never invented or unverified). Now populated: 6-7 videos per
// lever, sorted by real YouTube view count (most-viewed first, matching
// user request "les vidéos qui ont eu le plus de vues") — each candidate
// was found via web search, its view count scraped from the public watch
// page (no API key; the trailing `// N vues` comment records the count at
// scrape time, Aug 2026 — YouTube's oEmbed endpoint doesn't expose views),
// then confirmed valid against YouTube's oEmbed endpoint (the same one
// lib/levers/resources.ts uses at render time) before being kept. sortOrder
// reflects the view-count ranking, consumed as-is by getLeverVideos's
// `orderBy(asc(sortOrder))` — no ranking logic in app code, all curation
// happens here. durationLabel is left null throughout (no reliable way to
// verify exact duration without a real player fetch) — see
// lever-video-grid.tsx, an absent durationLabel just omits the corner badge.
//
// Shape once populated:
//   { leverKey: "email_marketing", youtubeUrl: "https://youtube.com/watch?v=...", durationLabel: "12 min", lang: "fr", sortOrder: 1 }
import postgres from "postgres";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sql = postgres(env.DATABASE_URL, { prepare: false });

const RESOURCES = [
  // --- ACQUISITION ---
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=8P_Kc4p61is", durationLabel: null, lang: "fr", sortOrder: 1 }, // 4299 vues
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=d1Bzd7-RvsY", durationLabel: null, lang: "fr", sortOrder: 2 }, // 1609 vues
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=V9zw83-dXvo", durationLabel: null, lang: "en", sortOrder: 3 }, // 1538 vues
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=5JnZPoSj42k", durationLabel: null, lang: "en", sortOrder: 4 }, // 1385 vues
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=sJkMoKkxET0", durationLabel: null, lang: "fr", sortOrder: 5 }, // 1061 vues
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=XtPbejFkwV0", durationLabel: null, lang: "en", sortOrder: 6 }, // 566 vues
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=IE6gfmtT5Oc", durationLabel: null, lang: "en", sortOrder: 7 }, // 451 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=0NtA6ureKMU", durationLabel: null, lang: "fr", sortOrder: 1 }, // 2983 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=oeMD1gllOm4", durationLabel: null, lang: "fr", sortOrder: 2 }, // 2621 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=M-r0falrq7s", durationLabel: null, lang: "fr", sortOrder: 3 }, // 1435 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=Z13BTfcio6Q", durationLabel: null, lang: "fr", sortOrder: 4 }, // 1242 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=7DKaFGRsneU", durationLabel: null, lang: "fr", sortOrder: 5 }, // 465 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=mNfMz7L08w0", durationLabel: null, lang: "fr", sortOrder: 6 }, // 428 vues
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=6IsKdgEkKzU", durationLabel: null, lang: "fr", sortOrder: 7 }, // 397 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=W5cobkEARzw", durationLabel: null, lang: "fr", sortOrder: 1 }, // 13805 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=QIUMfFU0z1k", durationLabel: null, lang: "fr", sortOrder: 2 }, // 9582 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=sj_uPwkrZnw", durationLabel: null, lang: "fr", sortOrder: 3 }, // 7324 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=hRUIkhRq0yQ", durationLabel: null, lang: "fr", sortOrder: 4 }, // 3818 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=J6TBJlOvOZA", durationLabel: null, lang: "fr", sortOrder: 5 }, // 3198 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=rdkhx6LlRus", durationLabel: null, lang: "fr", sortOrder: 6 }, // 1997 vues
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=zaJLCQ_pMU0", durationLabel: null, lang: "fr", sortOrder: 7 }, // 820 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=XdT9Gys_Ou4", durationLabel: null, lang: "fr", sortOrder: 1 }, // 160889 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=Qo1oxeXb9sg", durationLabel: null, lang: "fr", sortOrder: 2 }, // 127895 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=UxIRq_bWE6I", durationLabel: null, lang: "fr", sortOrder: 3 }, // 105334 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=igMArqSpdNg", durationLabel: null, lang: "fr", sortOrder: 4 }, // 62749 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=RdCqIR1SWJU", durationLabel: null, lang: "fr", sortOrder: 5 }, // 20864 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=LjHhdSHwgxE", durationLabel: null, lang: "fr", sortOrder: 6 }, // 13531 vues
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=mqFUys1Spdk", durationLabel: null, lang: "fr", sortOrder: 7 }, // 3667 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=vs5tJdlSesI", durationLabel: null, lang: "fr", sortOrder: 1 }, // 104761 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=KhRkp7pw4O0", durationLabel: null, lang: "fr", sortOrder: 2 }, // 51328 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=8yhaJItm2sM", durationLabel: null, lang: "fr", sortOrder: 3 }, // 50873 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=Kbeua_M18eM", durationLabel: null, lang: "fr", sortOrder: 4 }, // 41629 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=O9bqtJ4GQZs", durationLabel: null, lang: "fr", sortOrder: 5 }, // 8594 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=QEHPu8vrNVE", durationLabel: null, lang: "fr", sortOrder: 6 }, // 7713 vues
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=WsgMcgBF-C8", durationLabel: null, lang: "fr", sortOrder: 7 }, // 4492 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=imCMy6aIM0I", durationLabel: null, lang: "fr", sortOrder: 1 }, // 18094 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=YQJ-s2Q-604", durationLabel: null, lang: "fr", sortOrder: 2 }, // 6391 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=JBS-ydEvgkM", durationLabel: null, lang: "fr", sortOrder: 3 }, // 4742 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=4Mk_Pf_NuG4", durationLabel: null, lang: "fr", sortOrder: 4 }, // 2177 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=1KqdSzKPknA", durationLabel: null, lang: "fr", sortOrder: 5 }, // 1553 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=3LmX3XtnGoA", durationLabel: null, lang: "fr", sortOrder: 6 }, // 1367 vues
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=2iuJmE93i8I", durationLabel: null, lang: "fr", sortOrder: 7 }, // 1142 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=n6KESwNrxcw", durationLabel: null, lang: "fr", sortOrder: 1 }, // 2284 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=D0yx2keHNas", durationLabel: null, lang: "fr", sortOrder: 2 }, // 2213 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=HGXa0rdWh9Q", durationLabel: null, lang: "fr", sortOrder: 3 }, // 1016 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=vF0SlUNM_ao", durationLabel: null, lang: "fr", sortOrder: 4 }, // 1006 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=pUAH_4e5Qmg", durationLabel: null, lang: "fr", sortOrder: 5 }, // 709 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=XAJDwwRanxU", durationLabel: null, lang: "fr", sortOrder: 6 }, // 470 vues
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=wnQAy3spFCM", durationLabel: null, lang: "fr", sortOrder: 7 }, // 281 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=JFJlkBvCXsI", durationLabel: null, lang: "fr", sortOrder: 1 }, // 161220 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=upy0vZqkagY", durationLabel: null, lang: "fr", sortOrder: 2 }, // 66941 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=QKcCmNGNYRM", durationLabel: null, lang: "fr", sortOrder: 3 }, // 29981 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=WxVdVOZPZ-A", durationLabel: null, lang: "fr", sortOrder: 4 }, // 24444 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=5dqWRDgV7vk", durationLabel: null, lang: "fr", sortOrder: 5 }, // 10266 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=czhCx3eh9pE", durationLabel: null, lang: "fr", sortOrder: 6 }, // 10029 vues
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=D1YhfZIde3I", durationLabel: null, lang: "fr", sortOrder: 7 }, // 8543 vues
  // --- VENTE ---
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=KMZUENuSoQs", durationLabel: null, lang: "fr", sortOrder: 1 }, // 4203 vues
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=P1TjZMDJ3fs", durationLabel: null, lang: "fr", sortOrder: 2 }, // 2186 vues
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=9kt_M3qTmJ8", durationLabel: null, lang: "fr", sortOrder: 3 }, // 1582 vues
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=wX3V2nsIIqg", durationLabel: null, lang: "fr", sortOrder: 4 }, // 874 vues
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=KS50tQfNazw", durationLabel: null, lang: "fr", sortOrder: 5 }, // 772 vues
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=HB5OfJ6l14w", durationLabel: null, lang: "fr", sortOrder: 6 }, // 461 vues
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=VM3OulkFhlM", durationLabel: null, lang: "fr", sortOrder: 7 }, // 310 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=ZeKTfBkaewc", durationLabel: null, lang: "fr", sortOrder: 1 }, // 4555 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=eHKrdUvgQ0w", durationLabel: null, lang: "fr", sortOrder: 2 }, // 1848 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=IxoGF1cIvPc", durationLabel: null, lang: "fr", sortOrder: 3 }, // 1382 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=B6Sv0lJGe48", durationLabel: null, lang: "fr", sortOrder: 4 }, // 1111 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=iVLUNQTMaT4", durationLabel: null, lang: "fr", sortOrder: 5 }, // 717 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=FXkkyk76qeY", durationLabel: null, lang: "fr", sortOrder: 6 }, // 374 vues
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=lrfrqvccIc0", durationLabel: null, lang: "fr", sortOrder: 7 }, // 349 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=4_xEJbHgmAQ", durationLabel: null, lang: "fr", sortOrder: 1 }, // 12242 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=ngOLMijtIJI", durationLabel: null, lang: "fr", sortOrder: 2 }, // 11907 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=jw8oYLVtUXU", durationLabel: null, lang: "fr", sortOrder: 3 }, // 9339 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=hWgaI0BQrDY", durationLabel: null, lang: "fr", sortOrder: 4 }, // 1143 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=BqZIYdpEq5I", durationLabel: null, lang: "fr", sortOrder: 5 }, // 1064 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=1vKf3hFZJ8g", durationLabel: null, lang: "fr", sortOrder: 6 }, // 815 vues
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=lMVQ4B-ipBs", durationLabel: null, lang: "fr", sortOrder: 7 }, // 426 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=85euPc-XjpE", durationLabel: null, lang: "fr", sortOrder: 1 }, // 15867 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=9a3Qlvc4C4k", durationLabel: null, lang: "fr", sortOrder: 2 }, // 7380 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=tBh0VWEbvug", durationLabel: null, lang: "fr", sortOrder: 3 }, // 5147 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=SvUMJqnUPj0", durationLabel: null, lang: "fr", sortOrder: 4 }, // 1370 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=gjPVeZyjejk", durationLabel: null, lang: "fr", sortOrder: 5 }, // 1317 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=f_1UTMKxRlY", durationLabel: null, lang: "fr", sortOrder: 6 }, // 536 vues
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=BsyQRFFR7BQ", durationLabel: null, lang: "fr", sortOrder: 7 }, // 493 vues
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=MpjRyB8qsZU", durationLabel: null, lang: "fr", sortOrder: 1 }, // 51902 vues
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=gJVvejPB7wY", durationLabel: null, lang: "fr", sortOrder: 2 }, // 45924 vues
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=osFD_ZpuHWY", durationLabel: null, lang: "fr", sortOrder: 3 }, // 1769 vues
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=sN-dtweypcM", durationLabel: null, lang: "fr", sortOrder: 4 }, // 415 vues
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=0ygkNliUBII", durationLabel: null, lang: "fr", sortOrder: 5 }, // 85 vues
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=5NxI1X5Jxzg", durationLabel: null, lang: "fr", sortOrder: 6 }, // 56 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=G7dxT7lZoaA", durationLabel: null, lang: "fr", sortOrder: 1 }, // 1733 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=dfGovtSoU8k", durationLabel: null, lang: "fr", sortOrder: 2 }, // 574 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=Aid-FRCLCtE", durationLabel: null, lang: "fr", sortOrder: 3 }, // 560 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=R4EJL1NCMTM", durationLabel: null, lang: "fr", sortOrder: 4 }, // 517 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=mYH6p3ckBVA", durationLabel: null, lang: "fr", sortOrder: 5 }, // 448 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=-c4nNiqcQdk", durationLabel: null, lang: "fr", sortOrder: 6 }, // 272 vues
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=45GEDAbkuLU", durationLabel: null, lang: "fr", sortOrder: 7 }, // 7 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=rF-MB_Fn3rg", durationLabel: null, lang: "fr", sortOrder: 1 }, // 2185 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=823O8LRfRus", durationLabel: null, lang: "fr", sortOrder: 2 }, // 1897 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=FqYlN7jjb0o", durationLabel: null, lang: "fr", sortOrder: 3 }, // 446 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=_qo9K0tH6j8", durationLabel: null, lang: "fr", sortOrder: 4 }, // 440 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=bfq0Zx--hOc", durationLabel: null, lang: "fr", sortOrder: 5 }, // 363 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=pygNBE5Y4iM", durationLabel: null, lang: "fr", sortOrder: 6 }, // 361 vues
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=WY6Oo9f4RFo", durationLabel: null, lang: "fr", sortOrder: 7 }, // 177 vues
  // --- DÉLIVRABILITÉ ---
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=ZEuWEwRsRdc", durationLabel: null, lang: "fr", sortOrder: 1 }, // 23133 vues
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=JNjTweCDtWI", durationLabel: null, lang: "fr", sortOrder: 2 }, // 2319 vues
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=ebwcdWAniNM", durationLabel: null, lang: "fr", sortOrder: 3 }, // 2072 vues
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=kER1NUGQJQo", durationLabel: null, lang: "fr", sortOrder: 4 }, // 1010 vues
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=PpatcIoDA-w", durationLabel: null, lang: "fr", sortOrder: 5 }, // 416 vues
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=qjtwF7iNa6Q", durationLabel: null, lang: "fr", sortOrder: 6 }, // 270 vues
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=Yu6xnbiaOcU", durationLabel: null, lang: "fr", sortOrder: 7 }, // 118 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=L1wQZotVmqA", durationLabel: null, lang: "en", sortOrder: 1 }, // 13479 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=IWxDpq5wwaY", durationLabel: null, lang: "en", sortOrder: 2 }, // 12631 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=orSKcwoaDQs", durationLabel: null, lang: "fr", sortOrder: 3 }, // 10512 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=W7EKEBs5XeQ", durationLabel: null, lang: "fr", sortOrder: 4 }, // 9417 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=492AP1QoJA0", durationLabel: null, lang: "fr", sortOrder: 5 }, // 2536 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=Avwy6EhpvFQ", durationLabel: null, lang: "fr", sortOrder: 6 }, // 2263 vues
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=egM_-rUETyU", durationLabel: null, lang: "en", sortOrder: 7 }, // 653 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=PvEF0H-3xtk", durationLabel: null, lang: "fr", sortOrder: 1 }, // 3942 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=Ia4fURNpuOc", durationLabel: null, lang: "fr", sortOrder: 2 }, // 2441 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=YOo02zG8b1U", durationLabel: null, lang: "fr", sortOrder: 3 }, // 2136 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=ISzhPrxEPLk", durationLabel: null, lang: "fr", sortOrder: 4 }, // 2025 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=5jmIXZGZHps", durationLabel: null, lang: "fr", sortOrder: 5 }, // 1641 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=MeTO7f6HtYY", durationLabel: null, lang: "fr", sortOrder: 6 }, // 1510 vues
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=nfUBkccYwg8", durationLabel: null, lang: "fr", sortOrder: 7 }, // 891 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=8oWtqwFTndw", durationLabel: null, lang: "fr", sortOrder: 1 }, // 37088 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=R06O-w1l3UA", durationLabel: null, lang: "fr", sortOrder: 2 }, // 4368 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=HUD9Kbsk2gw", durationLabel: null, lang: "fr", sortOrder: 3 }, // 3152 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=BbQAbi4Tk1Q", durationLabel: null, lang: "fr", sortOrder: 4 }, // 2179 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=wFMEURlNx2g", durationLabel: null, lang: "fr", sortOrder: 5 }, // 2156 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=6eFqUKJUzDg", durationLabel: null, lang: "fr", sortOrder: 6 }, // 650 vues
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=S1RUSrESHyI", durationLabel: null, lang: "fr", sortOrder: 7 }, // 602 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=4_xEJbHgmAQ", durationLabel: null, lang: "fr", sortOrder: 1 }, // 12242 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=ngOLMijtIJI", durationLabel: null, lang: "fr", sortOrder: 2 }, // 11908 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=jw8oYLVtUXU", durationLabel: null, lang: "fr", sortOrder: 3 }, // 9339 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=ThLsHFPwuks", durationLabel: null, lang: "fr", sortOrder: 4 }, // 6675 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=AZYZGmnpOpk", durationLabel: null, lang: "fr", sortOrder: 5 }, // 5331 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=CnhbNbk-X_g", durationLabel: null, lang: "fr", sortOrder: 6 }, // 270 vues
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=IVVPRjUpKj4", durationLabel: null, lang: "fr", sortOrder: 7 }, // 186 vues
];

await sql`delete from lever_resources`;

for (const resource of RESOURCES) {
  await sql`
    insert into lever_resources (lever_key, youtube_url, duration_label, lang, sort_order)
    values (${resource.leverKey}, ${resource.youtubeUrl}, ${resource.durationLabel ?? null}, ${resource.lang ?? "fr"}, ${resource.sortOrder})
  `;
}

const rows = await sql`select count(*)::int as n from lever_resources`;
console.log(`Seeded ${rows[0].n} lever resources`);

await sql.end();
