import { z } from "zod";

import {
  META_AD_FIELDS,
  META_AD_SET_FIELDS,
  META_CAMPAIGN_FIELDS,
  META_DEFAULT_ATTRIBUTION_SETTINGS,
  META_GRAPH_API_BASE,
  META_INSIGHT_FIELDS,
  metaAdsEdge,
  metaAdSetsEdge,
  metaCampaignsEdge,
  metaInsightsEdge,
  normalizeAdAccountId,
} from "./protocol";
import type { MetaAttributionSettings, MetaRawObject } from "./types";

const graphErrorSchema = z.object({
  message: z.string().optional(),
  type: z.string().optional(),
  code: z.number().optional(),
  error_subcode: z.number().optional(),
});

const graphPageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).default([]),
  paging: z
    .object({
      next: z.string().url().optional(),
    })
    .optional(),
  error: graphErrorSchema.optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

const debugTokenResponseSchema = z.object({
  data: z.object({
    app_id: z.string().optional(),
    type: z.string().optional(),
    application: z.string().optional(),
    expires_at: z.number().optional(),
    data_access_expiration_time: z.number().optional(),
    is_valid: z.boolean().optional(),
    scopes: z.array(z.string()).optional(),
    user_id: z.string().optional(),
  }),
});

const graphObjectSchema = z.record(z.string(), z.unknown());

export class MetaApiError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly retryable: boolean;

  constructor(message: string, options: { code?: number; subcode?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "MetaApiError";
    this.code = options.code ?? null;
    this.subcode = options.subcode ?? null;
    this.retryable = options.retryable ?? false;
  }
}

function isRecord(value: unknown): value is MetaRawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGraphPayload(value: unknown): z.infer<typeof graphPageSchema> {
  const parsed = graphPageSchema.safeParse(value);
  if (!parsed.success) throw new MetaApiError("Réponse Meta invalide.");
  if (parsed.data.error) {
    const error = parsed.data.error;
    const code = error.code;
    throw new MetaApiError(error.message ?? "Meta a refusé la requête.", {
      code,
      subcode: error.error_subcode,
      retryable: code === 1 || code === 2 || code === 17 || code === 613,
    });
  }
  return parsed.data;
}

async function fetchJson(url: URL, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MetaApiError("Meta a renvoyé une réponse illisible.", { retryable: response.status >= 500 });
  }
  if (!response.ok) {
    const error = isRecord(payload) ? graphErrorSchema.safeParse(payload.error) : { success: false as const };
    throw new MetaApiError(
      error.success ? error.data.message ?? "La requête Meta a échoué." : "La requête Meta a échoué.",
      {
        code: error.success ? error.data.code : undefined,
        subcode: error.success ? error.data.error_subcode : undefined,
        retryable: response.status >= 500,
      },
    );
  }
  return payload;
}

function withAccessToken(url: URL, accessToken: string): URL {
  const next = new URL(url.toString());
  next.searchParams.set("access_token", accessToken);
  return next;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): URL {
  const url = new URL(path.startsWith("http") ? path : `${META_GRAPH_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchPage(path: string, accessToken: string, params: Record<string, string | number | undefined>) {
  const url = withAccessToken(buildUrl(path, params), accessToken);
  return parseGraphPayload(await fetchJson(url));
}

async function fetchObject(path: string, accessToken: string, params: Record<string, string | number | undefined>) {
  const url = withAccessToken(buildUrl(path, params), accessToken);
  const payload = await fetchJson(url);
  if (isRecord(payload) && payload.error) {
    const error = graphErrorSchema.safeParse(payload.error);
    throw new MetaApiError(error.success ? error.data.message ?? "Meta a refusé la requête." : "Meta a refusé la requête.", {
      code: error.success ? error.data.code : undefined,
      subcode: error.success ? error.data.error_subcode : undefined,
    });
  }
  const parsed = graphObjectSchema.safeParse(payload);
  if (!parsed.success) throw new MetaApiError("Réponse Meta invalide.");
  return parsed.data;
}

export async function getMetaObject(accessToken: string, objectId: string, fields: string): Promise<MetaRawObject> {
  return fetchObject(`/${encodeURIComponent(objectId)}`, accessToken, { fields });
}

async function fetchAllPages(
  firstPath: string,
  accessToken: string,
  params: Record<string, string | number | undefined>,
): Promise<MetaRawObject[]> {
  let page = await fetchPage(firstPath, accessToken, params);
  const rows = [...page.data];
  let next = page.paging?.next;

  for (let pageNumber = 0; next && pageNumber < 100; pageNumber += 1) {
    const nextUrl = new URL(next);
    if (nextUrl.hostname !== new URL(META_GRAPH_API_BASE).hostname) {
      throw new MetaApiError("Pagination Meta invalide.");
    }
    nextUrl.searchParams.delete("access_token");
    page = await fetchPage(nextUrl.toString(), accessToken, Object.fromEntries(nextUrl.searchParams.entries()));
    rows.push(...page.data);
    next = page.paging?.next;
  }
  return rows;
}

function parseTokenResponse(value: unknown) {
  const parsed = tokenResponseSchema.safeParse(value);
  if (!parsed.success) throw new MetaApiError("Meta n'a pas renvoyé de jeton valide.");
  return {
    accessToken: parsed.data.access_token,
    expiresInSeconds: parsed.data.expires_in ?? null,
  };
}

export type MetaTokenResult = {
  accessToken: string;
  expiresInSeconds: number | null;
};

export async function exchangeMetaCode(input: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
}): Promise<MetaTokenResult> {
  const url = buildUrl("/oauth/access_token", {
    client_id: input.appId,
    client_secret: input.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  return parseTokenResponse(await fetchJson(url));
}

export async function exchangeForLongLivedMetaToken(input: {
  accessToken: string;
  appId: string;
  appSecret: string;
}): Promise<MetaTokenResult> {
  const url = buildUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.accessToken,
  });
  return parseTokenResponse(await fetchJson(url));
}

export async function debugMetaToken(input: { accessToken: string; appId: string; appSecret: string }) {
  const url = buildUrl("/debug_token", { input_token: input.accessToken });
  url.searchParams.set("access_token", `${input.appId}|${input.appSecret}`);
  const response = await fetchJson(url);
  const parsed = debugTokenResponseSchema.safeParse(response);
  if (!parsed.success) throw new MetaApiError("Meta n'a pas renvoyé les droits du jeton.");
  return parsed.data.data;
}

export async function getMetaUser(accessToken: string): Promise<{ id: string; name: string | null }> {
  const response = await fetchObject("/me", accessToken, { fields: "id,name" });
  if (typeof response.id !== "string") throw new MetaApiError("Profil Meta introuvable.");
  return { id: response.id, name: typeof response.name === "string" ? response.name : null };
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaRawObject[]> {
  return fetchAllPages("/me/adaccounts", accessToken, {
    fields: "id,account_id,name,currency,timezone_name,account_status,disable_reason",
    limit: 100,
  });
}

export async function listMetaCampaigns(accessToken: string, adAccountId: string): Promise<MetaRawObject[]> {
  return fetchAllPages(metaCampaignsEdge(adAccountId), accessToken, {
    fields: META_CAMPAIGN_FIELDS.join(","),
    limit: 100,
  });
}

export async function listMetaAdSets(accessToken: string, adAccountId: string): Promise<MetaRawObject[]> {
  return fetchAllPages(metaAdSetsEdge(adAccountId), accessToken, {
    fields: META_AD_SET_FIELDS.join(","),
    limit: 100,
  });
}

export async function listMetaAds(accessToken: string, adAccountId: string): Promise<MetaRawObject[]> {
  return fetchAllPages(metaAdsEdge(adAccountId), accessToken, {
    fields: META_AD_FIELDS.join(","),
    limit: 100,
  });
}

export async function listMetaInsights(input: {
  accessToken: string;
  adAccountId: string;
  level: "account" | "campaign" | "adset" | "ad";
  since: string;
  until: string;
  attributionSettings?: MetaAttributionSettings;
  breakdowns?: string[];
}): Promise<MetaRawObject[]> {
  const attribution = input.attributionSettings ?? META_DEFAULT_ATTRIBUTION_SETTINGS;
  return fetchAllPages(metaInsightsEdge(input.adAccountId), input.accessToken, {
    level: input.level,
    fields: META_INSIGHT_FIELDS.join(","),
    time_range: JSON.stringify({ since: input.since, until: input.until }),
    time_increment: 1,
    action_attribution_windows: JSON.stringify([attribution.clickWindow, attribution.viewWindow]),
    breakdowns: input.breakdowns?.length ? input.breakdowns.join(",") : undefined,
    limit: 100,
  });
}

export async function updateMetaObject(input: {
  accessToken: string;
  objectId: string;
  values: Record<string, string | number>;
}): Promise<MetaRawObject> {
  const url = buildUrl(`/${encodeURIComponent(input.objectId)}`, {});
  const body = new URLSearchParams({ access_token: input.accessToken });
  for (const [key, value] of Object.entries(input.values)) body.set(key, String(value));
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MetaApiError("Meta a renvoyé une réponse illisible.", { retryable: response.status >= 500 });
  }
  if (!isRecord(payload)) throw new MetaApiError("Réponse Meta invalide.");
  const error = graphErrorSchema.safeParse(payload.error);
  if (error.success && error.data) {
    throw new MetaApiError(error.data.message ?? "Meta a refusé la modification.", {
      code: error.data.code,
      subcode: error.data.error_subcode,
      retryable: error.data.code === 1 || error.data.code === 2 || error.data.code === 17,
    });
  }
  if (!response.ok) throw new MetaApiError("La modification Meta a échoué.", { retryable: response.status >= 500 });
  return payload;
}

export async function revokeMetaPermissions(accessToken: string): Promise<void> {
  const url = withAccessToken(buildUrl("/me/permissions", {}), accessToken);
  const response = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new MetaApiError("Meta n'a pas pu révoquer les permissions.", { retryable: response.status >= 500 });
}

export function parseMetaNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function parseMetaOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function actionValue(actions: unknown, ...types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((total, item) => {
    if (!isRecord(item) || typeof item.action_type !== "string") return total;
    if (types.length > 0 && !types.includes(item.action_type)) return total;
    return total + parseMetaNumber(item.value);
  }, 0);
}

export function actionValueFromList(actions: unknown, ...types: string[]): number | null {
  if (!Array.isArray(actions)) return null;
  let found = false;
  const value = actions.reduce((total, item) => {
    if (!isRecord(item) || typeof item.action_type !== "string" || (types.length > 0 && !types.includes(item.action_type))) return total;
    found = true;
    return total + parseMetaNumber(item.value);
  }, 0);
  return found ? value : null;
}

export function normalizeMetaObject(value: unknown): MetaRawObject {
  const parsed = graphObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function metaApiObjectUrl(objectId: string): string {
  return `${META_GRAPH_API_BASE}/${encodeURIComponent(objectId)}`;
}

export function metaAccountApiId(value: string): string {
  return normalizeAdAccountId(value);
}
