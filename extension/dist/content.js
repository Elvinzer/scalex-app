"use strict";
const minalyReservedInstagramPaths = new Set(["accounts", "explore", "direct", "reels", "p", "stories"]);
const minalyDefaultStages = ["first_message_sent", "conversation_in_progress", "value_content_sent", "call_proposed", "call_booked"];
const minalyDefaultSources = ["instagram", "linkedin", "tiktok", "youtube", "x", "facebook", "email_newsletter", "ads", "bouche_a_oreille", "autre"];
function minalyIsRecord(value) {
    return typeof value === "object" && value !== null;
}
function minalySplitName(displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    return { firstName: parts[0] ?? displayName, lastName: parts.slice(1).join(" ") };
}
function minalyProfilePath(platform, rawPath) {
    const parts = rawPath.split("/").filter(Boolean);
    if (platform === "instagram") {
        const handle = parts[0]?.toLowerCase();
        if (!handle || minalyReservedInstagramPaths.has(handle))
            return null;
        return { path: `/${handle}`, handle };
    }
    const section = parts[0]?.toLowerCase();
    const handle = parts[1]?.toLowerCase();
    if (!section || !handle || !["in", "company"].includes(section))
        return null;
    return { path: `/${section}/${handle}`, handle };
}
function minalyVisibleProfileHref(hostname, platform) {
    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
        const href = anchor.getAttribute("href");
        if (!href)
            continue;
        try {
            const url = new URL(href, window.location.origin);
            const anchorHost = url.hostname.toLowerCase().replace(/^www\./, "");
            if (anchorHost !== hostname)
                continue;
            const result = minalyProfilePath(platform, url.pathname);
            if (result && (anchor.textContent?.trim() || anchor.getAttribute("aria-label")))
                return result;
        }
        catch {
            continue;
        }
    }
    return null;
}
function minalyProfileUrl() {
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
function minalyVisibleName(handle) {
    const heading = Array.from(document.querySelectorAll("h1, h2")).map((node) => node.textContent?.trim() ?? "").find(Boolean);
    return heading ?? handle;
}
function minalyVisibleMessageTime() {
    for (const node of Array.from(document.querySelectorAll("[data-timestamp]"))) {
        const raw = node.getAttribute("datetime") ?? node.getAttribute("data-timestamp");
        if (!raw)
            continue;
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime()))
            return date.toISOString();
    }
    const pathname = window.location.pathname.toLowerCase();
    if (!pathname.includes("/direct") && !pathname.includes("/messaging"))
        return null;
    for (const node of Array.from(document.querySelectorAll("time[datetime]"))) {
        const raw = node.getAttribute("datetime");
        if (!raw)
            continue;
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime()))
            return date.toISOString();
    }
    return null;
}
function minalyProfile() {
    const detected = minalyProfileUrl();
    if (!detected)
        return null;
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
function minalyApiProfile(profile) {
    return { ...profile, profileUrl: profile.canonicalProfileUrl, handle: profile.normalizedHandle };
}
async function minalyRequest(path, payload) {
    try {
        const result = await chrome.runtime.sendMessage({ type: "minaly-api-request", path, payload });
        if (!minalyIsRecord(result) || typeof result.status !== "number")
            return { status: 503, body: null };
        return { status: result.status, body: result.body ?? null };
    }
    catch {
        return { status: 503, body: { error: "network_error" } };
    }
}
function minalyReadQualification(value) {
    if (!minalyIsRecord(value))
        return null;
    const offers = Array.isArray(value.offers) ? value.offers.flatMap((item) => minalyIsRecord(item) && typeof item.id === "string" && typeof item.name === "string" ? [{ id: item.id, name: item.name }] : []) : [];
    const sources = Array.isArray(value.sources) ? value.sources.filter((item) => typeof item === "string") : minalyDefaultSources;
    const stages = Array.isArray(value.stages) ? value.stages.filter((item) => typeof item === "string") : minalyDefaultStages;
    const responsible = minalyIsRecord(value.responsible) && typeof value.responsible.id === "string" && typeof value.responsible.name === "string" ? { id: value.responsible.id, name: value.responsible.name } : null;
    return { offers, sources, stages, responsible };
}
function minalyReadLead(value) {
    if (!minalyIsRecord(value) || typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.stage !== "string" || typeof value.outcome !== "string")
        return null;
    const nextAction = minalyIsRecord(value.nextAction) && typeof value.nextAction.title === "string" && typeof value.nextAction.dueAt === "string" ? { title: value.nextAction.title, dueAt: value.nextAction.dueAt } : null;
    return { id: value.id, displayName: value.displayName, stage: value.stage, outcome: value.outcome, responsibleSetterName: typeof value.responsibleSetterName === "string" ? value.responsibleSetterName : null, nextAction };
}
function minalyReadResolution(body) {
    if (!minalyIsRecord(body))
        return null;
    const data = minalyIsRecord(body.data) ? body.data : body;
    const raw = minalyIsRecord(body.resolution) ? body.resolution : data;
    const kind = raw.kind ?? raw.state;
    if (kind === "unknown" && minalyIsRecord(raw.profile)) {
        const profile = raw.profile;
        const parsedProfile = {
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
        return { resolution: { kind: "unknown", profile: parsedProfile, qualification: minalyReadQualification(data.qualification) }, qualification: minalyReadQualification(data.qualification) };
    }
    if (kind === "known") {
        const lead = minalyReadLead(raw.lead);
        return lead ? { resolution: { kind: "known", lead }, qualification: null } : null;
    }
    if (kind === "ambiguous" && minalyIsRecord(raw.profile) && Array.isArray(raw.candidates)) {
        const candidates = raw.candidates.flatMap((candidate) => minalyReadLead(candidate) ? [minalyReadLead(candidate)] : []);
        const profile = minalyProfile();
        return profile ? { resolution: { kind: "ambiguous", profile, candidates }, qualification: null } : null;
    }
    return null;
}
function minalyStageLabel(stage) {
    return { first_message_sent: "1er message envoyé", conversation_in_progress: "Conversation en cours", value_content_sent: "Contenu de valeur envoyé", call_proposed: "Appel proposé", call_booked: "Appel booké" }[stage] ?? stage;
}
function minalyOutcomeLabel(outcome) {
    return { none: "En cours", no_show: "No-show", lost: "Perdu", sold: "Vendu" }[outcome] ?? outcome;
}
function minalyFormatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(document.documentElement.lang || "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function minalyBuildPanel(shadow, state, resolution, profile, message, successLeadUrl, onClose, onCapture, onUpdate) {
    const panel = shadow.querySelector(".minaly-panel");
    if (!(panel instanceof HTMLElement))
        return;
    panel.replaceChildren();
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    const header = document.createElement("div");
    header.className = "minaly-header";
    const title = document.createElement("strong");
    title.textContent = "Minaly CRM";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.className = "minaly-close";
    close.setAttribute("aria-label", "Fermer");
    close.addEventListener("click", onClose);
    header.append(title, close);
    panel.append(header);
    if (state === "loading") {
        panel.append(minalyElement("p", "Recherche du profil…"));
        return;
    }
    if (state === "session") {
        panel.append(minalyElement("p", "Session expirée. Connecte-toi à Minaly pour continuer."));
        const login = minalyElement("button", "Ouvrir Minaly");
        login.className = "minaly-primary";
        login.addEventListener("click", () => void chrome.runtime.sendMessage({ type: "minaly-open-auth" }));
        panel.append(login);
        return;
    }
    if (state === "unavailable") {
        panel.append(minalyElement("p", "Le CRM est indisponible ou désactivé pour ce compte."));
        return;
    }
    if (state === "error") {
        panel.append(minalyElement("p", message ?? "Impossible de lire ce profil."));
        return;
    }
    if (state === "success") {
        panel.append(minalyElement("p", message ?? "Lead enregistré dans le CRM."));
        if (successLeadUrl) {
            const link = document.createElement("a");
            link.href = successLeadUrl;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = "Ouvrir la fiche lead";
            link.className = "minaly-link";
            panel.append(link);
        }
        return;
    }
    if (!resolution || !profile)
        return;
    const profileLine = minalyElement("p", `${profile.displayName} · ${profile.platform}`);
    profileLine.className = "minaly-profile";
    panel.append(profileLine);
    if (resolution.kind === "unknown") {
        panel.append(minalyElement("p", "Nouveau profil, pas encore dans le CRM."));
        panel.append(minalyElement("p", `URL : ${profile.canonicalProfileUrl}`));
        const firstName = document.createElement("input");
        firstName.className = "minaly-field";
        firstName.value = profile.firstName;
        firstName.placeholder = "Prénom (facultatif)";
        const lastName = document.createElement("input");
        lastName.className = "minaly-field";
        lastName.value = profile.lastName;
        lastName.placeholder = "Nom (facultatif)";
        const qualification = resolution.qualification;
        const offer = document.createElement("select");
        offer.className = "minaly-field";
        const noOffer = minalyElement("option", "Offre à choisir");
        noOffer.value = "";
        offer.append(noOffer);
        for (const item of qualification?.offers ?? []) {
            const option = minalyElement("option", item.name);
            option.value = item.id;
            offer.append(option);
        }
        const source = document.createElement("select");
        source.className = "minaly-field";
        for (const item of qualification?.sources ?? minalyDefaultSources) {
            const option = minalyElement("option", item);
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
        panel.append(firstName, lastName, offer, source, stage);
        const responsible = qualification?.responsible?.name ?? "non assigné";
        panel.append(minalyElement("p", `Responsable (lecture seule) : ${responsible}`));
        panel.append(minalyElement("p", `Message reçu : ${profile.messageOccurredAt ? minalyFormatDate(profile.messageOccurredAt) : "date non détectée"}`));
        panel.append(minalyElement("p", `Capturé : ${minalyFormatDate(profile.capturedAt)}`));
        const add = minalyElement("button", "Ajouter au CRM");
        add.className = "minaly-primary";
        add.addEventListener("click", () => onCapture({ firstName: firstName.value.trim() || undefined, lastName: lastName.value.trim() || undefined, offerId: offer.value || null, source: source.value, stage: stage.value }));
        panel.append(add);
        return;
    }
    if (resolution.kind === "known") {
        panel.append(minalyElement("p", "Ce profil existe déjà dans le CRM."));
        panel.append(minalyElement("p", `Responsable (lecture seule) : ${resolution.lead.responsibleSetterName ?? "non assigné"}`));
        panel.append(minalyElement("p", `Résultat : ${minalyOutcomeLabel(resolution.lead.outcome)}`));
        if (resolution.lead.nextAction)
            panel.append(minalyElement("p", `Prochaine action : ${resolution.lead.nextAction.title} · ${minalyFormatDate(resolution.lead.nextAction.dueAt)}`));
        const displayName = document.createElement("input");
        displayName.className = "minaly-field";
        displayName.value = resolution.lead.displayName;
        displayName.placeholder = "Nom affiché";
        panel.append(displayName);
        const stage = document.createElement("select");
        stage.className = "minaly-field";
        for (const option of minalyDefaultStages) {
            const item = minalyElement("option", minalyStageLabel(option));
            item.value = option;
            item.selected = option === resolution.lead.stage;
            stage.append(item);
        }
        panel.append(stage);
        const note = document.createElement("textarea");
        note.className = "minaly-field";
        note.placeholder = "Ajouter une note…";
        note.rows = 2;
        panel.append(note);
        const actionTitle = document.createElement("input");
        actionTitle.className = "minaly-field";
        actionTitle.placeholder = "Prochaine action (facultatif)";
        const actionDue = document.createElement("input");
        actionDue.className = "minaly-field";
        actionDue.type = "datetime-local";
        panel.append(actionTitle, actionDue);
        const save = minalyElement("button", "Enregistrer");
        save.className = "minaly-secondary";
        save.addEventListener("click", () => {
            const action = actionTitle.value.trim() && actionDue.value ? { category: "prospecting", type: "follow_up", title: actionTitle.value.trim(), dueAt: new Date(actionDue.value).toISOString(), priority: 0 } : undefined;
            onUpdate({ leadId: resolution.lead.id, stage: stage.value, displayName: displayName.value.trim(), note: note.value.trim() || undefined, action });
        });
        panel.append(save);
        return;
    }
    panel.append(minalyElement("p", "Correspondance incertaine. Vérifie le profil visité avant de choisir."));
    for (const candidate of resolution.candidates) {
        const choose = minalyElement("button", `Confirmer la correspondance : ${candidate.displayName}`);
        choose.className = "minaly-secondary";
        choose.addEventListener("click", () => onCapture({ leadId: candidate.id }));
        panel.append(choose);
    }
    const separate = minalyElement("button", "Créer un nouveau lead séparé");
    separate.className = "minaly-secondary";
    separate.addEventListener("click", () => onCapture({ separateFromCandidates: true }));
    panel.append(separate);
}
function minalyElement(tag, text) {
    const element = document.createElement(tag);
    if (text !== undefined)
        element.textContent = text;
    return element;
}
function minalyMount() {
    if (document.getElementById("minaly-crm-extension"))
        return;
    const profile = minalyProfile();
    if (!profile)
        return;
    const host = document.createElement("div");
    host.id = "minaly-crm-extension";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ".minaly-button{position:fixed;right:22px;bottom:22px;z-index:2147483647;border:0;border-radius:999px;padding:12px 18px;background:var(--minaly-accent,var(--accent,currentColor));color:Canvas;font:700 14px system-ui;box-shadow:0 8px 24px var(--minaly-shadow,transparent);cursor:pointer}.minaly-panel{position:fixed;right:22px;bottom:76px;z-index:2147483647;width:320px;max-width:calc(100vw - 32px);max-height:calc(100vh - 96px);overflow:auto;padding:16px;border-radius:16px;background:var(--minaly-surface,Canvas);color:var(--minaly-text,CanvasText);font:14px system-ui;box-shadow:0 16px 42px var(--minaly-shadow,transparent)}.minaly-header{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.minaly-close{border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer}.minaly-profile{font-weight:700}.minaly-panel button,.minaly-link{display:block;width:100%;margin-top:8px;padding:10px;border-radius:9px;cursor:pointer;font:700 13px system-ui;text-align:center;text-decoration:none}.minaly-primary{border:0;background:var(--minaly-accent,var(--accent,currentColor));color:Canvas}.minaly-secondary{border:1px solid var(--minaly-border,ButtonBorder);background:var(--minaly-surface,Canvas);color:var(--minaly-text,CanvasText)}.minaly-field{box-sizing:border-box;width:100%;margin-top:8px;padding:9px;border:1px solid var(--minaly-border,ButtonBorder);border-radius:9px;background:var(--minaly-surface,Canvas);color:var(--minaly-text,CanvasText);font:13px system-ui}.minaly-panel p{line-height:1.4;margin:8px 0}.minaly-panel button:focus-visible,.minaly-field:focus-visible,.minaly-link:focus-visible{outline:3px solid var(--minaly-accent,var(--accent,currentColor));outline-offset:2px}";
    shadow.append(style);
    const button = minalyElement("button", "Minaly");
    button.className = "minaly-button";
    button.type = "button";
    const panel = minalyElement("div");
    panel.className = "minaly-panel";
    panel.hidden = true;
    shadow.append(button, panel);
    document.documentElement.append(host);
    let state = "closed";
    let resolution = null;
    let message = null;
    let successLeadUrl = null;
    const close = () => { state = "closed"; panel.hidden = true; };
    const draw = () => { panel.hidden = state === "closed"; minalyBuildPanel(shadow, state, resolution, profile, message, successLeadUrl, close, (selection) => void capture(selection), (input) => void update(input)); };
    const resolve = async () => {
        const result = await minalyRequest("/api/crm/extension/resolve", minalyApiProfile(profile));
        if (result.status === 401) {
            state = "session";
            return;
        }
        if (result.status === 403 || result.status === 503) {
            state = "unavailable";
            return;
        }
        if (result.status < 200 || result.status >= 300) {
            state = "error";
            message = "Impossible de lire ce profil.";
            return;
        }
        const parsed = minalyReadResolution(result.body);
        if (!parsed) {
            state = "error";
            message = "Réponse CRM invalide.";
            return;
        }
        resolution = parsed.resolution;
        state = parsed.resolution.kind;
    };
    const capture = async (selection) => {
        state = "loading";
        message = null;
        draw();
        const result = await minalyRequest("/api/crm/extension/capture", { decision: selection.leadId ? "confirm_match" : "create_new", candidateLeadId: selection.leadId, separateFromCandidates: selection.separateFromCandidates, idempotencyKey: profile.sourceEventKey, profile: { ...minalyApiProfile(profile), firstName: selection.firstName ?? profile.firstName, lastName: selection.lastName ?? profile.lastName }, qualification: { offerId: selection.offerId ?? null, source: selection.source ?? profile.platform, stage: selection.stage ?? "first_message_sent" } });
        if (result.status === 401) {
            state = "session";
            draw();
            return;
        }
        if (result.status === 403 || result.status === 503) {
            state = "unavailable";
            draw();
            return;
        }
        if (result.status === 409) {
            state = "ambiguous";
            message = "Une décision explicite est nécessaire.";
            draw();
            return;
        }
        if (result.status < 200 || result.status >= 300 || !minalyIsRecord(result.body)) {
            message = "Impossible d'enregistrer ce profil.";
            state = "error";
            draw();
            return;
        }
        const data = minalyIsRecord(result.body.data) ? result.body.data : result.body;
        const leadId = typeof data.leadId === "string" ? data.leadId : null;
        if (!leadId) {
            message = "Réponse CRM invalide.";
            state = "error";
            draw();
            return;
        }
        const origin = typeof data.crmUrl === "string" ? data.crmUrl : "https://minaly.app";
        successLeadUrl = `${origin}/crm/leads/${leadId}`;
        state = "success";
        message = "Lead enregistré dans le CRM.";
        draw();
    };
    const update = async (input) => {
        state = "loading";
        message = null;
        draw();
        const result = await minalyRequest("/api/crm/extension/update", { ...input, idempotencyKey: `${profile.sourceEventKey}:${Date.now()}` });
        if (result.status === 401) {
            state = "session";
            draw();
            return;
        }
        if (result.status === 403 || result.status === 503) {
            state = "unavailable";
            draw();
            return;
        }
        if (result.status < 200 || result.status >= 300) {
            message = "Impossible d'enregistrer la modification.";
            state = "error";
            draw();
            return;
        }
        await resolve();
        message = "Modification enregistrée.";
        draw();
    };
    button.addEventListener("click", async () => {
        if (state !== "closed") {
            close();
            return;
        }
        state = "loading";
        resolution = null;
        message = null;
        draw();
        await resolve();
        draw();
    });
}
minalyMount();
let minalyLastUrl = window.location.href;
window.setInterval(() => {
    if (window.location.href === minalyLastUrl)
        return;
    minalyLastUrl = window.location.href;
    document.getElementById("minaly-crm-extension")?.remove();
    minalyMount();
}, 1000);
