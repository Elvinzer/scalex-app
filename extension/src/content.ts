type MinalyExtensionPlatform = "instagram" | "linkedin";
type MinalyExtensionState = "closed" | "loading" | "session" | "unknown" | "known" | "ambiguous" | "success" | "unavailable" | "error";

type MinalyExtensionProfile = {
  platform: MinalyExtensionPlatform;
  canonicalProfileUrl: string;
  normalizedHandle: string;
  displayName: string;
  firstName: string;
  lastName: string;
  messageOccurredAt: string | null;
  capturedAt: string;
  sourceEventKey: string;
};

type MinalyQualification = {
  offers: Array<{ id: string; name: string }>;
  defaultOfferId: string | null;
  sources: string[];
  stages: string[];
  responsible: { id: string; name: string } | null;
};

type MinalyExtensionLead = {
  id: string;
  displayName: string;
  canonicalProfileUrl: string | null;
  stage: string;
  outcome: string;
  responsibleSetterName: string | null;
  nextAction: { title: string; dueAt: string } | null;
};

type MinalyExtensionResolution =
  | { kind: "unknown"; profile: MinalyExtensionProfile; qualification: MinalyQualification | null }
  | { kind: "known"; lead: MinalyExtensionLead }
  | { kind: "ambiguous"; profile: MinalyExtensionProfile; candidates: MinalyExtensionLead[] };

type MinalyCaptureSelection = {
  leadId?: string;
  separateFromCandidates?: boolean;
  firstName?: string;
  lastName?: string;
  offerId?: string | null;
  source?: string;
  stage?: string;
};

type MinalyUpdateInput = {
  leadId: string;
  stage?: string;
  displayName?: string;
  note?: string;
  action?: { category: "prospecting" | "sales" | "appointment"; type: string; title: string; dueAt: string; priority: number };
};

const minalyReservedInstagramPaths = new Set(["accounts", "explore", "direct", "reels", "p", "stories"]);
const minalyDefaultStages = ["first_message_sent", "conversation_in_progress", "value_content_sent", "call_proposed", "call_booked"];
const minalyDefaultSources = ["instagram", "linkedin", "tiktok", "youtube", "x", "facebook", "email_newsletter", "ads", "bouche_a_oreille", "autre"];

function minalyIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function minalySplitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? displayName, lastName: parts.slice(1).join(" ") };
}

function minalyProfilePath(platform: MinalyExtensionPlatform, rawPath: string): { path: string; handle: string } | null {
  const parts = rawPath.split("/").filter(Boolean);
  if (platform === "instagram") {
    const handle = parts[0]?.toLowerCase();
    if (!handle || minalyReservedInstagramPaths.has(handle)) return null;
    return { path: `/${handle}`, handle };
  }
  const section = parts[0]?.toLowerCase();
  const handle = parts[1]?.toLowerCase();
  if (!section || !handle || !["in", "company"].includes(section)) return null;
  return { path: `/${section}/${handle}`, handle };
}

function minalyVisibleProfileHref(hostname: string, platform: MinalyExtensionPlatform): { path: string; handle: string } | null {
  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    try {
      const url = new URL(href, window.location.origin);
      const anchorHost = url.hostname.toLowerCase().replace(/^www\./, "");
      if (anchorHost !== hostname) continue;
      const result = minalyProfilePath(platform, url.pathname);
      if (result && (anchor.textContent?.trim() || anchor.getAttribute("aria-label"))) return result;
    } catch {
      continue;
    }
  }
  return null;
}

function minalyProfileUrl(): { platform: MinalyExtensionPlatform; url: string; handle: string } | null {
  const hostname = window.location.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "instagram.com") {
    const result = minalyProfilePath("instagram", window.location.pathname) ?? minalyVisibleProfileHref(hostname, "instagram");
    return result ? { platform: "instagram", url: `https://instagram.com${result.path}`, handle: result.handle } : null;
  }
  if (hostname === "linkedin.com") {
    const result = minalyProfilePath("linkedin", window.location.pathname) ?? minalyVisibleProfileHref(hostname, "linkedin");
    return result ? { platform: "linkedin", url: `https://linkedin.com${result.path}`, handle: result.handle } : null;
  }
  return null;
}

function minalyVisibleName(handle: string): string {
  const heading = Array.from(document.querySelectorAll("h1, h2")).map((node) => node.textContent?.trim() ?? "").find(Boolean);
  return heading ?? handle;
}

function minalyVisibleMessageTime(): string | null {
  for (const node of Array.from(document.querySelectorAll("[data-timestamp]"))) {
    const raw = node.getAttribute("datetime") ?? node.getAttribute("data-timestamp");
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const pathname = window.location.pathname.toLowerCase();
  if (!pathname.includes("/direct") && !pathname.includes("/messaging")) return null;
  for (const node of Array.from(document.querySelectorAll("time[datetime]"))) {
    const raw = node.getAttribute("datetime");
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function minalyProfile(): MinalyExtensionProfile | null {
  const detected = minalyProfileUrl();
  if (!detected) return null;
  const displayName = minalyVisibleName(detected.handle);
  const names = minalySplitName(displayName);
  const messageOccurredAt = minalyVisibleMessageTime();
  const capturedAt = new Date().toISOString();
  return {
    platform: detected.platform,
    canonicalProfileUrl: detected.url,
    normalizedHandle: detected.handle,
    displayName,
    firstName: names.firstName,
    lastName: names.lastName,
    messageOccurredAt,
    capturedAt,
    sourceEventKey: `extension:${detected.platform}:${detected.url}:${messageOccurredAt ?? "profile"}`,
  };
}

function minalyApiProfile(profile: MinalyExtensionProfile): Record<string, unknown> {
  return { ...profile, profileUrl: profile.canonicalProfileUrl, handle: profile.normalizedHandle };
}

async function minalyRequest(path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  try {
    const result: unknown = await chrome.runtime.sendMessage({ type: "minaly-api-request", path, payload });
    if (!minalyIsRecord(result) || typeof result.status !== "number") return { status: 503, body: null };
    return { status: result.status, body: result.body ?? null };
  } catch {
    return { status: 503, body: { error: "network_error" } };
  }
}

function minalyApiErrorMessage(body: unknown): string {
  const code = minalyIsRecord(body) && typeof body.error === "string" ? body.error : null;
  if (code === "extension_not_configured") return "L’extension n’est pas encore configurée côté serveur.";
  if (code === "network_error") return "Minaly ne répond pas. Vérifie ta connexion puis réessaie.";
  if (code === "rate_limited") return "Trop de tentatives rapprochées. Attends quelques secondes puis réessaie.";
  return "Impossible de joindre le CRM pour le moment.";
}

function minalyReadQualification(value: unknown): MinalyQualification | null {
  if (!minalyIsRecord(value)) return null;
  const offers = Array.isArray(value.offers) ? value.offers.flatMap((item) => minalyIsRecord(item) && typeof item.id === "string" && typeof item.name === "string" ? [{ id: item.id, name: item.name }] : []) : [];
  const defaultOfferId = typeof value.defaultOfferId === "string" && offers.some((offer) => offer.id === value.defaultOfferId) ? value.defaultOfferId : offers.length === 1 ? offers[0].id : null;
  const sources = Array.isArray(value.sources) ? value.sources.filter((item): item is string => typeof item === "string") : minalyDefaultSources;
  const stages = Array.isArray(value.stages) ? value.stages.filter((item): item is string => typeof item === "string") : minalyDefaultStages;
  const responsible = minalyIsRecord(value.responsible) && typeof value.responsible.id === "string" && typeof value.responsible.name === "string" ? { id: value.responsible.id, name: value.responsible.name } : null;
  return { offers, defaultOfferId, sources, stages, responsible };
}

function minalyReadLead(value: unknown): MinalyExtensionLead | null {
  if (!minalyIsRecord(value) || typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.stage !== "string" || typeof value.outcome !== "string") return null;
  const nextAction = minalyIsRecord(value.nextAction) && typeof value.nextAction.title === "string" && typeof value.nextAction.dueAt === "string" ? { title: value.nextAction.title, dueAt: value.nextAction.dueAt } : null;
  return { id: value.id, displayName: value.displayName, canonicalProfileUrl: typeof value.canonicalProfileUrl === "string" ? value.canonicalProfileUrl : null, stage: value.stage, outcome: value.outcome, responsibleSetterName: typeof value.responsibleSetterName === "string" ? value.responsibleSetterName : null, nextAction };
}

function minalyReadResolution(body: unknown): { resolution: MinalyExtensionResolution; qualification: MinalyQualification | null } | null {
  if (!minalyIsRecord(body)) return null;
  const data = minalyIsRecord(body.data) ? body.data : body;
  const raw = minalyIsRecord(body.resolution) ? body.resolution : data;
  const kind = raw.kind ?? raw.state;
  if (kind === "unknown" && minalyIsRecord(raw.profile)) {
    const profile = raw.profile;
    const parsedProfile: MinalyExtensionProfile = {
      platform: profile.platform === "linkedin" ? "linkedin" : "instagram",
      canonicalProfileUrl: typeof profile.canonicalProfileUrl === "string" ? profile.canonicalProfileUrl : "",
      normalizedHandle: typeof profile.normalizedHandle === "string" ? profile.normalizedHandle : "",
      displayName: typeof profile.displayName === "string" ? profile.displayName : "",
      firstName: typeof profile.firstName === "string" ? profile.firstName : "",
      lastName: typeof profile.lastName === "string" ? profile.lastName : "",
      messageOccurredAt: typeof profile.messageOccurredAt === "string" ? profile.messageOccurredAt : null,
      capturedAt: typeof profile.capturedAt === "string" ? profile.capturedAt : new Date().toISOString(),
      sourceEventKey: typeof profile.sourceEventKey === "string" ? profile.sourceEventKey : "",
    };
    const qualification = minalyReadQualification(data.qualification);
    return { resolution: { kind: "unknown", profile: parsedProfile, qualification }, qualification };
  }
  if (kind === "known") {
    const lead = minalyReadLead(raw.lead);
    return lead ? { resolution: { kind: "known", lead }, qualification: null } : null;
  }
  if (kind === "ambiguous" && minalyIsRecord(raw.profile) && Array.isArray(raw.candidates)) {
    const candidates = raw.candidates.flatMap((candidate) => {
      const lead = minalyReadLead(candidate);
      return lead ? [lead] : [];
    });
    const profile = minalyProfile();
    return profile ? { resolution: { kind: "ambiguous", profile, candidates }, qualification: null } : null;
  }
  return null;
}

function minalyStageLabel(stage: string): string {
  return ({ first_message_sent: "1er message envoyé", conversation_in_progress: "Conversation en cours", value_content_sent: "Contenu de valeur envoyé", call_proposed: "Appel proposé", call_booked: "Appel booké" } as Record<string, string>)[stage] ?? stage;
}

function minalyOutcomeLabel(outcome: string): string {
  return ({ none: "En cours", no_show: "No-show", lost: "Perdu", sold: "Vendu" } as Record<string, string>)[outcome] ?? outcome;
}

function minalyFormatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(document.documentElement.lang || "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function minalyPlatformLabel(platform: MinalyExtensionPlatform): string {
  return platform === "linkedin" ? "LinkedIn" : "Instagram";
}

function minalySourceLabel(source: string): string {
  return ({ instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", x: "X", facebook: "Facebook", email_newsletter: "Newsletter", ads: "Publicité", bouche_a_oreille: "Bouche-à-oreille", autre: "Autre" } as Record<string, string>)[source] ?? source;
}

function minalyInitials(name: string): string {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return initials || "L";
}

function minalyIcon(name: "check" | "close" | "external" | "lock" | "refresh"): SVGSVGElement {
  const paths = { check: "M5 12.5 9.5 17 19 7", close: "M6 6 18 18M18 6 6 18", external: "M14 5h5v5M19 5 11 13M17 13v5H5V6h5", lock: "M7 10V8a5 5 0 0 1 10 0v2M6 10h12v9H6z", refresh: "M20 11a8 8 0 1 0 2 5M20 5v6h-6" } as const;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.classList.add("minaly-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name]);
  icon.append(path);
  return icon;
}

function minalyButton(label: string, className: "minaly-primary" | "minaly-secondary"): HTMLButtonElement {
  const button = minalyElement("button", label);
  button.type = "button";
  button.className = className;
  return button;
}

function minalyLabeledField(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, labelText: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "minaly-field-label";
  const text = minalyElement("span", labelText);
  text.className = "minaly-label-text";
  label.append(text, control);
  return label;
}

function minalyDetail(labelText: string, valueText: string, noteText?: string): HTMLDivElement {
  const detail = document.createElement("div");
  detail.className = "minaly-detail";
  const label = minalyElement("span", labelText);
  label.className = "minaly-detail-label";
  const value = minalyElement("strong", valueText);
  detail.append(label, value);
  if (noteText) {
    const note = minalyElement("small", noteText);
    note.className = "minaly-detail-note";
    detail.append(note);
  }
  return detail;
}

function minalyStatusBlock(eyebrow: string, title: string, description: string, statusClass: string): HTMLDivElement {
  const block = document.createElement("div");
  block.className = `minaly-status-block ${statusClass}`;
  const eyebrowNode = minalyElement("span", eyebrow);
  eyebrowNode.className = "minaly-eyebrow";
  const titleNode = minalyElement("h2", title);
  const descriptionNode = minalyElement("p", description);
  block.append(eyebrowNode, titleNode, descriptionNode);
  return block;
}

function minalyProfileCard(displayName: string, secondary: string, profileUrl: string | null = null): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "minaly-profile-card";
  const avatar = minalyElement("span", minalyInitials(displayName));
  avatar.className = "minaly-avatar";
  const identity = document.createElement("div");
  identity.className = "minaly-profile-identity";
  identity.append(minalyElement("strong", displayName), minalyElement("span", secondary));
  card.append(avatar, identity);
  const profileLink = minalyProfileLink(profileUrl);
  if (profileLink) card.append(profileLink);
  return card;
}

function minalyProfileLink(url: string | null, label = "Ouvrir le profil"): HTMLAnchorElement | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || (hostname !== "instagram.com" && hostname !== "linkedin.com")) return null;
  } catch {
    return null;
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "minaly-profile-link";
  link.title = url;
  link.append(minalyElement("span", label), minalyIcon("external"));
  return link;
}

function minalyCallout(eyebrow: string, text: string, className: string): HTMLDivElement {
  const callout = document.createElement("div");
  callout.className = `minaly-callout ${className}`;
  const label = minalyElement("strong", eyebrow);
  const content = minalyElement("p", text);
  callout.append(label, content);
  return callout;
}

function minalyBuildPanel(
  shadow: ShadowRoot,
  state: MinalyExtensionState,
  resolution: MinalyExtensionResolution | null,
  profile: MinalyExtensionProfile | null,
  message: string | null,
  successLeadUrl: string | null,
  onClose: () => void,
  onOpenAuth: () => void,
  onRetry: () => void,
  onCapture: (selection: MinalyCaptureSelection) => void,
  onUpdate: (input: MinalyUpdateInput) => void,
): void {
  const panel = shadow.querySelector(".minaly-panel");
  if (!(panel instanceof HTMLElement)) return;
  panel.replaceChildren();
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "minaly-panel-title");

  const header = document.createElement("header");
  header.className = "minaly-header";
  const brand = document.createElement("div");
  brand.className = "minaly-brand";
  const mark = minalyElement("span", "m");
  mark.className = "minaly-mark";
  const brandCopy = document.createElement("div");
  brandCopy.className = "minaly-brand-copy";
  const title = minalyElement("strong", "Minaly CRM");
  title.id = "minaly-panel-title";
  brandCopy.append(title, minalyElement("span", "Capture depuis ton profil"));
  brand.append(mark, brandCopy);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "minaly-close";
  close.setAttribute("aria-label", "Fermer");
  close.append(minalyIcon("close"));
  close.addEventListener("click", onClose);
  header.append(brand, close);

  const body = document.createElement("div");
  body.className = "minaly-body";
  body.setAttribute("aria-live", "polite");
  panel.append(header, body);

  if (state === "loading") {
    body.append(minalyStatusBlock("VÉRIFICATION", "Analyse du profil", "Je vérifie s’il existe déjà dans ton CRM.", "minaly-status-loading"));
    const progress = document.createElement("div");
    progress.className = "minaly-progress";
    progress.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    body.append(progress);
    return;
  }

  if (state === "session") {
    const status = minalyStatusBlock("CONNEXION REQUISE", "Connecte-toi à Minaly", "La capture utilisera ton compte et attribuera le lead à ton identité.", "minaly-status-session");
    status.prepend(minalyIcon("lock"));
    body.append(status);
    const login = minalyButton("Se connecter à Minaly", "minaly-primary");
    login.addEventListener("click", onOpenAuth);
    const retry = minalyButton("J’ai terminé, vérifier", "minaly-secondary");
    retry.addEventListener("click", onRetry);
    body.append(login, retry, minalyElement("p", "La connexion s’ouvre dans un nouvel onglet."));
    body.lastElementChild?.classList.add("minaly-helper");
    return;
  }

  if (state === "unavailable") {
    body.append(minalyStatusBlock("CRM INDISPONIBLE", "Le CRM n’est pas accessible", "Vérifie que le module CRM est activé pour ce compte Minaly.", "minaly-status-error"));
    const retry = minalyButton("Réessayer", "minaly-secondary");
    retry.prepend(minalyIcon("refresh"));
    retry.addEventListener("click", onRetry);
    body.append(retry);
    return;
  }

  if (state === "error") {
    body.append(minalyStatusBlock("UNE ERREUR EST SURVENUE", "Profil non vérifié", message ?? "Impossible de lire ce profil pour le moment.", "minaly-status-error"));
    const retry = minalyButton("Réessayer", "minaly-secondary");
    retry.prepend(minalyIcon("refresh"));
    retry.addEventListener("click", onRetry);
    body.append(retry);
    return;
  }

  if (state === "success") {
    const status = minalyStatusBlock("CAPTURE TERMINÉE", "Lead enregistré", message ?? "Le lead est maintenant dans ton CRM.", "minaly-status-success");
    status.prepend(minalyIcon("check"));
    body.append(status);
    if (successLeadUrl) {
      const link = document.createElement("a");
      link.href = successLeadUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "minaly-secondary minaly-link";
      link.append(minalyElement("span", "Ouvrir la fiche lead"), minalyIcon("external"));
      body.append(link);
    }
    return;
  }

  if (!resolution || !profile) return;

  if (resolution.kind === "unknown") {
    body.append(minalyProfileCard(profile.displayName, `@${profile.normalizedHandle} · ${minalyPlatformLabel(profile.platform)}`, profile.canonicalProfileUrl));
    body.append(minalyCallout("NOUVEAU LEAD", "Ce profil n’existe pas encore dans ton CRM.", "minaly-callout-neutral"));

    const sectionTitle = minalyElement("h2", "Informations du lead");
    sectionTitle.className = "minaly-section-title";
    body.append(sectionTitle);
    const firstName = document.createElement("input");
    firstName.className = "minaly-field";
    firstName.value = profile.firstName;
    firstName.autocomplete = "given-name";
    const lastName = document.createElement("input");
    lastName.className = "minaly-field";
    lastName.value = profile.lastName;
    lastName.autocomplete = "family-name";
    const nameGrid = document.createElement("div");
    nameGrid.className = "minaly-field-grid";
    nameGrid.append(minalyLabeledField(firstName, "Prénom"), minalyLabeledField(lastName, "Nom"));
    body.append(nameGrid);

    const qualification = resolution.qualification;
    const offer = document.createElement("select");
    offer.className = "minaly-field";
    const offers = qualification?.offers ?? [];
    if (offers.length !== 1) {
      const noOffer = minalyElement("option", offers.length > 1 ? "Choisir un produit" : "Aucun produit configuré");
      noOffer.value = "";
      noOffer.selected = true;
      noOffer.disabled = offers.length === 0;
      offer.append(noOffer);
    }
    for (const item of offers) {
      const option = minalyElement("option", item.name);
      option.value = item.id;
      option.selected = item.id === qualification?.defaultOfferId;
      offer.append(option);
    }

    const source = document.createElement("select");
    source.className = "minaly-field";
    for (const item of qualification?.sources ?? minalyDefaultSources) {
      const option = minalyElement("option", minalySourceLabel(item));
      option.value = item;
      option.selected = item === profile.platform;
      source.append(option);
    }

    const stage = document.createElement("select");
    stage.className = "minaly-field";
    for (const item of qualification?.stages ?? minalyDefaultStages) {
      const option = minalyElement("option", minalyStageLabel(item));
      option.value = item;
      option.selected = item === "first_message_sent";
      stage.append(option);
    }
    const qualificationGrid = document.createElement("div");
    qualificationGrid.className = "minaly-field-grid";
    qualificationGrid.append(minalyLabeledField(offer, "Produit"), minalyLabeledField(source, "Source"));
    body.append(qualificationGrid, minalyLabeledField(stage, "Étape de départ"));

    const responsible = qualification?.responsible?.name ?? "À définir";
    const details = document.createElement("div");
    details.className = "minaly-details-grid";
    details.append(minalyDetail("Responsable", responsible, "Depuis ta session"), minalyDetail("Profil", profile.canonicalProfileUrl, "Lecture seule"));
    body.append(details);

    const context = document.createElement("div");
    context.className = "minaly-context";
    context.append(minalyElement("span", `Message détecté : ${profile.messageOccurredAt ? minalyFormatDate(profile.messageOccurredAt) : "non détecté"}`), minalyElement("span", `Capturé : ${minalyFormatDate(profile.capturedAt)}`));
    body.append(context);

    const add = minalyButton("Ajouter le lead", "minaly-primary");
    add.addEventListener("click", () => onCapture({ firstName: firstName.value.trim() || undefined, lastName: lastName.value.trim() || undefined, offerId: offer.value || null, source: source.value, stage: stage.value }));
    body.append(add);
    return;
  }

  if (resolution.kind === "known") {
    body.append(minalyProfileCard(resolution.lead.displayName, `Lead existant · ${minalyOutcomeLabel(resolution.lead.outcome)}`, resolution.lead.canonicalProfileUrl));
    body.append(minalyCallout("DÉJÀ DANS LE CRM", "Tu peux mettre à jour les informations et la prochaine action depuis cette fiche.", "minaly-callout-known"));
    const details = document.createElement("div");
    details.className = "minaly-details-grid";
    details.append(minalyDetail("Responsable", resolution.lead.responsibleSetterName ?? "Non assigné"), minalyDetail("Étape actuelle", minalyStageLabel(resolution.lead.stage)));
    body.append(details);

    const displayName = document.createElement("input");
    displayName.className = "minaly-field";
    displayName.value = resolution.lead.displayName;
    displayName.autocomplete = "name";
    body.append(minalyLabeledField(displayName, "Nom affiché"));

    const stage = document.createElement("select");
    stage.className = "minaly-field";
    for (const option of minalyDefaultStages) {
      const item = minalyElement("option", minalyStageLabel(option));
      item.value = option;
      item.selected = option === resolution.lead.stage;
      stage.append(item);
    }
    body.append(minalyLabeledField(stage, "Étape"));

    const note = document.createElement("textarea");
    note.className = "minaly-field";
    note.rows = 3;
    body.append(minalyLabeledField(note, "Note d’équipe"));

    const actionTitle = document.createElement("input");
    actionTitle.className = "minaly-field";
    actionTitle.autocomplete = "off";
    const actionDue = document.createElement("input");
    actionDue.className = "minaly-field";
    actionDue.type = "datetime-local";
    const actionGrid = document.createElement("div");
    actionGrid.className = "minaly-field-grid";
    actionGrid.append(minalyLabeledField(actionTitle, "Prochaine action"), minalyLabeledField(actionDue, "Échéance"));
    body.append(actionGrid);

    const save = minalyButton("Enregistrer les changements", "minaly-primary");
    save.addEventListener("click", () => {
      const action = actionTitle.value.trim() && actionDue.value ? { category: "prospecting" as const, type: "follow_up", title: actionTitle.value.trim(), dueAt: new Date(actionDue.value).toISOString(), priority: 0 } : undefined;
      onUpdate({ leadId: resolution.lead.id, stage: stage.value, displayName: displayName.value.trim(), note: note.value.trim() || undefined, action });
    });
    body.append(save);
    return;
  }

  body.append(minalyProfileCard(profile.displayName, `@${profile.normalizedHandle} · ${minalyPlatformLabel(profile.platform)}`, profile.canonicalProfileUrl));
  body.append(minalyCallout("CORRESPONDANCE À VÉRIFIER", "Plusieurs leads correspondent à ce profil. Choisis la bonne fiche avant de continuer.", "minaly-callout-warning"));
  const candidates = document.createElement("div");
  candidates.className = "minaly-candidates";
  for (const candidate of resolution.candidates) {
    const candidateCard = document.createElement("div");
    candidateCard.className = "minaly-candidate-card";
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "minaly-candidate";
    const candidateIdentity = document.createElement("span");
    candidateIdentity.className = "minaly-candidate-identity";
    candidateIdentity.append(minalyElement("strong", candidate.displayName), minalyElement("span", `${minalyStageLabel(candidate.stage)} · ${minalyOutcomeLabel(candidate.outcome)}`));
    const candidateMeta = minalyElement("span", candidate.responsibleSetterName ?? "Non assigné");
    candidateMeta.className = "minaly-candidate-meta";
    choose.append(candidateIdentity, candidateMeta);
    choose.addEventListener("click", () => onCapture({ leadId: candidate.id }));
    candidateCard.append(choose);
    const candidateProfileLink = minalyProfileLink(candidate.canonicalProfileUrl);
    if (candidateProfileLink) candidateCard.append(candidateProfileLink);
    candidates.append(candidateCard);
  }
  body.append(candidates);
  const separate = minalyButton("Créer un nouveau lead séparé", "minaly-secondary");
  separate.addEventListener("click", () => onCapture({ separateFromCandidates: true }));
  body.append(separate);
}

function minalyElement<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function minalyMount(): void {
  if (document.getElementById("minaly-crm-extension")) return;
  const profile = minalyProfile();
  if (!profile) return;
  const host = document.createElement("div");
  host.id = "minaly-crm-extension";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
:host {
  --minaly-accent: var(--accent, #e8663c);
  --minaly-accent-hover: var(--accent-hover, #d55830);
  --minaly-accent-soft: var(--accent-soft, #fdf1ec);
  --minaly-accent-text: var(--accent-text, #712b13);
  --minaly-accent-2: var(--accent-2, #6d5cf6);
  --minaly-accent-2-soft: var(--accent-2-soft, #f1efff);
  --minaly-surface: Canvas;
  --minaly-surface-muted: color-mix(in srgb, CanvasText 4%, Canvas);
  --minaly-text: CanvasText;
  --minaly-text-muted: color-mix(in srgb, CanvasText 64%, Canvas);
  --minaly-border: color-mix(in srgb, CanvasText 16%, Canvas);
  --minaly-success: #276b3b;
  --minaly-success-soft: #e4f2e7;
  --minaly-warning: #8a4d00;
  --minaly-warning-soft: #fff4df;
  --minaly-danger: #a72d2d;
  --minaly-danger-soft: #fbe9e9;
  --minaly-shadow: color-mix(in srgb, CanvasText 18%, transparent);
  all: initial;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
.minaly-button, .minaly-panel { position: fixed; z-index: 2147483647; }
.minaly-button, .minaly-panel, .minaly-panel button, .minaly-panel input, .minaly-panel select, .minaly-panel textarea { font-family: inherit; }
.minaly-button { right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); min-height: 48px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--minaly-accent); color: var(--minaly-accent-text); font-size: 14px; font-weight: 750; letter-spacing: -0.01em; box-shadow: 0 12px 28px var(--minaly-shadow); cursor: pointer; touch-action: manipulation; transition: transform 180ms ease, background-color 180ms ease, box-shadow 180ms ease; }
.minaly-button:hover { background: var(--minaly-accent-hover); box-shadow: 0 14px 32px var(--minaly-shadow); transform: translateY(-1px); }
.minaly-button:active { transform: translateY(0); }
.minaly-panel { right: max(16px, env(safe-area-inset-right)); bottom: max(80px, calc(env(safe-area-inset-bottom) + 64px)); display: flex; width: min(390px, calc(100vw - 32px)); max-height: min(720px, calc(100dvh - 32px)); overflow: hidden; flex-direction: column; border: 1px solid var(--minaly-border); border-radius: 20px; background: var(--minaly-surface); color: var(--minaly-text); box-shadow: 0 24px 64px var(--minaly-shadow); font-size: 14px; line-height: 1.4; }
.minaly-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--minaly-border); }
.minaly-brand { display: flex; min-width: 0; align-items: center; gap: 10px; }
.minaly-mark { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 10px; background: var(--minaly-accent); color: var(--minaly-accent-text); font-size: 17px; font-weight: 800; }
.minaly-brand-copy { display: grid; min-width: 0; gap: 1px; }
.minaly-brand-copy strong { font-size: 14px; letter-spacing: -0.01em; }
.minaly-brand-copy span, .minaly-helper { color: var(--minaly-text-muted); font-size: 11px; }
.minaly-close { display: grid; width: 44px; height: 44px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 12px; background: transparent; color: var(--minaly-text-muted); cursor: pointer; touch-action: manipulation; transition: background-color 180ms ease, color 180ms ease; }
.minaly-close:hover { background: var(--minaly-surface-muted); color: var(--minaly-text); }
.minaly-body { display: grid; gap: 12px; min-height: 0; overflow-y: auto; padding: 18px 16px 16px; overscroll-behavior: contain; }
.minaly-body > p { margin: 0; }
.minaly-icon { width: 18px; height: 18px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.minaly-status-block { position: relative; display: grid; gap: 6px; padding: 4px 0 3px 34px; }
.minaly-status-block > .minaly-icon { position: absolute; top: 3px; left: 0; width: 22px; height: 22px; }
.minaly-status-block h2 { margin: 0; font-size: 18px; line-height: 1.15; letter-spacing: -0.03em; }
.minaly-status-block p { margin: 0; color: var(--minaly-text-muted); line-height: 1.5; }
.minaly-eyebrow, .minaly-section-title, .minaly-label-text, .minaly-detail-label { color: var(--minaly-text-muted); font-size: 11px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
.minaly-status-session { color: var(--minaly-accent-text); }
.minaly-status-session p, .minaly-status-error p { color: var(--minaly-text-muted); }
.minaly-status-error { color: var(--minaly-danger); }
.minaly-status-success { color: var(--minaly-success); }
.minaly-progress { display: grid; gap: 7px; padding: 7px 0 4px; }
.minaly-progress span { display: block; height: 8px; border-radius: 999px; background: var(--minaly-surface-muted); animation: minaly-pulse 1.2s ease-in-out infinite; }
.minaly-progress span:nth-child(1) { width: 82%; }
.minaly-progress span:nth-child(2) { width: 64%; animation-delay: 120ms; }
.minaly-progress span:nth-child(3) { width: 44%; animation-delay: 240ms; }
@keyframes minaly-pulse { 0%, 100% { opacity: .48; } 50% { opacity: 1; } }
.minaly-primary, .minaly-secondary, .minaly-link { display: flex; min-height: 46px; width: 100%; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 14px; font-size: 13px; font-weight: 750; line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; touch-action: manipulation; transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
.minaly-primary { border: 1px solid var(--minaly-accent); background: var(--minaly-accent); color: var(--minaly-accent-text); box-shadow: 0 8px 18px color-mix(in srgb, var(--minaly-accent) 28%, transparent); }
.minaly-primary:hover { border-color: var(--minaly-accent-hover); background: var(--minaly-accent-hover); transform: translateY(-1px); }
.minaly-secondary, .minaly-link { border: 1px solid var(--minaly-border); background: var(--minaly-surface); color: var(--minaly-text); }
.minaly-secondary:hover, .minaly-link:hover { border-color: color-mix(in srgb, var(--minaly-accent) 42%, var(--minaly-border)); background: var(--minaly-surface-muted); transform: translateY(-1px); }
.minaly-primary:active, .minaly-secondary:active, .minaly-link:active { transform: translateY(0); }
.minaly-profile-card { display: flex; flex-wrap: wrap; align-items: center; gap: 11px; padding: 12px; border: 1px solid var(--minaly-border); border-radius: 14px; background: var(--minaly-surface-muted); }
.minaly-avatar { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 12px; background: var(--minaly-accent-soft); color: var(--minaly-accent-text); font-size: 12px; font-weight: 800; }
.minaly-profile-identity, .minaly-candidate-identity { display: grid; min-width: 0; gap: 2px; }
.minaly-profile-identity { flex: 1 1 0; }
.minaly-profile-identity strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.minaly-profile-identity span { overflow: hidden; color: var(--minaly-text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.minaly-profile-link { display: inline-flex; min-height: 40px; flex-basis: 100%; align-items: center; justify-content: space-between; gap: 8px; overflow: hidden; border-top: 1px solid var(--minaly-border); padding-top: 9px; color: var(--minaly-accent-text); font-size: 12px; font-weight: 750; text-decoration: none; }
.minaly-profile-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.minaly-profile-link:hover { text-decoration: underline; }
.minaly-callout { display: grid; gap: 3px; padding: 11px 12px; border: 1px solid transparent; border-radius: 12px; }
.minaly-callout strong { font-size: 11px; letter-spacing: 0.06em; }
.minaly-callout p { margin: 0; color: var(--minaly-text-muted); font-size: 13px; line-height: 1.4; }
.minaly-callout-neutral { border-color: var(--minaly-border); background: var(--minaly-surface-muted); }
.minaly-callout-known { border-color: color-mix(in srgb, var(--minaly-accent-2) 26%, var(--minaly-border)); background: var(--minaly-accent-2-soft); }
.minaly-callout-known strong { color: var(--minaly-accent-2); }
.minaly-callout-warning { border-color: color-mix(in srgb, var(--minaly-warning) 28%, var(--minaly-border)); background: var(--minaly-warning-soft); }
.minaly-callout-warning strong { color: var(--minaly-warning); }
.minaly-section-title { margin: 3px 0 -3px; }
.minaly-field-grid, .minaly-details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.minaly-field-label { display: grid; min-width: 0; gap: 6px; }
.minaly-field { min-height: 44px; width: 100%; min-width: 0; border: 1px solid var(--minaly-border); border-radius: 10px; background: var(--minaly-surface); color: var(--minaly-text); padding: 10px 11px; font-size: 14px; line-height: 1.25; outline: none; }
textarea.minaly-field { min-height: 72px; resize: vertical; }
.minaly-field:focus-visible, .minaly-primary:focus-visible, .minaly-secondary:focus-visible, .minaly-close:focus-visible, .minaly-link:focus-visible, .minaly-profile-link:focus-visible, .minaly-candidate:focus-visible { outline: 3px solid color-mix(in srgb, var(--minaly-accent) 60%, transparent); outline-offset: 2px; }
.minaly-field:disabled { cursor: not-allowed; opacity: .52; }
.minaly-detail { display: grid; min-width: 0; gap: 3px; padding: 10px; border: 1px solid var(--minaly-border); border-radius: 10px; background: var(--minaly-surface-muted); }
.minaly-detail strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.minaly-detail-note { color: var(--minaly-text-muted); font-size: 11px; }
.minaly-context { display: grid; gap: 4px; color: var(--minaly-text-muted); font-size: 11px; }
.minaly-candidates { display: grid; gap: 8px; }
.minaly-candidate-card { display: grid; gap: 0; overflow: hidden; border: 1px solid var(--minaly-border); border-radius: 12px; background: var(--minaly-surface); }
.minaly-candidate { display: flex; min-height: 60px; width: 100%; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--minaly-border); border-radius: 12px; background: var(--minaly-surface); color: var(--minaly-text); padding: 10px 12px; text-align: left; cursor: pointer; touch-action: manipulation; transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease; }
.minaly-candidate-card .minaly-candidate { border: 0; border-radius: 0; }
.minaly-candidate-card .minaly-profile-link { border-top-color: var(--minaly-border); padding: 8px 12px; }
.minaly-candidate:hover { border-color: color-mix(in srgb, var(--minaly-accent) 42%, var(--minaly-border)); background: var(--minaly-surface-muted); transform: translateY(-1px); }
.minaly-candidate-identity strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.minaly-candidate-identity span, .minaly-candidate-meta { color: var(--minaly-text-muted); font-size: 11px; }
.minaly-candidate-meta { flex: 0 0 auto; text-align: right; }
@media (max-width: 420px) { .minaly-panel { right: 10px; bottom: max(68px, calc(env(safe-area-inset-bottom) + 52px)); width: calc(100vw - 20px); border-radius: 18px; } .minaly-button { right: 12px; } }
@media (orientation: landscape) and (max-height: 480px) { .minaly-panel { bottom: 8px; max-height: calc(100dvh - 16px); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
`;
  shadow.append(style);
  const button = minalyElement("button", "Minaly");
  button.className = "minaly-button";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  const panel = minalyElement("div");
  panel.className = "minaly-panel";
  panel.hidden = true;
  shadow.append(button, panel);
  document.documentElement.append(host);

  let state: MinalyExtensionState = "closed";
  let resolution: MinalyExtensionResolution | null = null;
  let message: string | null = null;
  let successLeadUrl: string | null = null;
  const close = () => { state = "closed"; panel.hidden = true; button.setAttribute("aria-expanded", "false"); };
  const openAuth = () => { void chrome.runtime.sendMessage({ type: "minaly-open-auth" }); };
  const draw = () => {
    panel.hidden = state === "closed";
    button.setAttribute("aria-expanded", String(state !== "closed"));
    minalyBuildPanel(shadow, state, resolution, profile, message, successLeadUrl, close, openAuth, () => void resolveAndDraw(), (selection) => void capture(selection), (input) => void update(input));
  };
  const resolve = async () => {
    const result = await minalyRequest("/api/crm/extension/resolve", minalyApiProfile(profile));
    if (result.status === 401) { state = "session"; return; }
    if (result.status === 403) { state = "unavailable"; return; }
    if (result.status === 503) { state = "error"; message = minalyApiErrorMessage(result.body); return; }
    if (result.status < 200 || result.status >= 300) { state = "error"; message = "Impossible de lire ce profil."; return; }
    const parsed = minalyReadResolution(result.body);
    if (!parsed) { state = "error"; message = "Réponse CRM invalide."; return; }
    resolution = parsed.resolution;
    state = parsed.resolution.kind;
  };
  const resolveAndDraw = async () => {
    state = "loading";
    message = null;
    draw();
    await resolve();
    draw();
  };
  const capture = async (selection: MinalyCaptureSelection) => {
    state = "loading";
    message = null;
    draw();
    const result = await minalyRequest("/api/crm/extension/capture", { decision: selection.leadId ? "confirm_match" : "create_new", candidateLeadId: selection.leadId, separateFromCandidates: selection.separateFromCandidates, idempotencyKey: profile.sourceEventKey, profile: { ...minalyApiProfile(profile), firstName: selection.firstName ?? profile.firstName, lastName: selection.lastName ?? profile.lastName }, qualification: { offerId: selection.offerId ?? null, source: selection.source ?? profile.platform, stage: selection.stage ?? "first_message_sent" } });
    if (result.status === 401) { state = "session"; draw(); return; }
    if (result.status === 403) { state = "unavailable"; draw(); return; }
    if (result.status === 503) { state = "error"; message = minalyApiErrorMessage(result.body); draw(); return; }
    if (result.status === 409) { state = "ambiguous"; message = "Une décision explicite est nécessaire."; draw(); return; }
    if (result.status < 200 || result.status >= 300 || !minalyIsRecord(result.body)) { message = "Impossible d’enregistrer ce profil."; state = "error"; draw(); return; }
    const data = minalyIsRecord(result.body.data) ? result.body.data : result.body;
    const leadId = typeof data.leadId === "string" ? data.leadId : null;
    if (!leadId) { message = "Réponse CRM invalide."; state = "error"; draw(); return; }
    const origin = typeof data.crmUrl === "string" ? data.crmUrl : "https://www.minaly.io";
    successLeadUrl = `${origin}/crm/leads/${leadId}`;
    state = "success";
    message = "Le lead est maintenant dans ton CRM.";
    draw();
  };
  const update = async (input: MinalyUpdateInput) => {
    state = "loading";
    message = null;
    draw();
    const result = await minalyRequest("/api/crm/extension/update", { ...input, idempotencyKey: `${profile.sourceEventKey}:${Date.now()}` });
    if (result.status === 401) { state = "session"; draw(); return; }
    if (result.status === 403) { state = "unavailable"; draw(); return; }
    if (result.status === 503) { state = "error"; message = minalyApiErrorMessage(result.body); draw(); return; }
    if (result.status < 200 || result.status >= 300) { message = "Impossible d’enregistrer la modification."; state = "error"; draw(); return; }
    await resolve();
    message = "Modification enregistrée.";
    draw();
  };
  chrome.runtime.onMessage.addListener((messageValue) => {
    if (!minalyIsRecord(messageValue) || state !== "session") return;
    if (messageValue.type === "minaly-authenticated") {
      void resolveAndDraw();
      return;
    }
    if (messageValue.type === "minaly-auth-failed") {
      const error = typeof messageValue.error === "string" ? messageValue.error : "auth_failed";
      state = error === "crm_unavailable" ? "unavailable" : "error";
      message = error === "extension_not_configured" ? "L’extension n’est pas encore configurée côté serveur." : "La connexion Minaly n’a pas pu être finalisée.";
      draw();
    }
  });
  button.addEventListener("click", () => {
    if (state !== "closed") { close(); return; }
    void resolveAndDraw();
  });
}

minalyMount();

let minalyLastUrl = window.location.href;
window.setInterval(() => {
  if (window.location.href === minalyLastUrl) return;
  minalyLastUrl = window.location.href;
  document.getElementById("minaly-crm-extension")?.remove();
  minalyMount();
}, 1000);
