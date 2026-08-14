export type BookingTheme = "light" | "dark";
export type BookingBackgroundType = "none" | "preset" | "upload";
export type BookingBackgroundPosition = "center" | "top" | "bottom";
export type BookingSideMediaType = "none" | "image" | "video" | "embed";

export type BookingPageSettingsData = {
  theme: BookingTheme;
  accentColor: string;
  backgroundType: BookingBackgroundType;
  backgroundKey: string | null;
  backgroundUrl: string | null;
  overlayOpacity: number;
  backgroundPosition: BookingBackgroundPosition;
  logoUrl: string | null;
  showCompanyName: boolean;
  sideMediaType: BookingSideMediaType;
  sideMediaUrl: string | null;
  sideMediaCaption: string | null;
  title: string | null;
  subtitle: string | null;
  emoji: string | null;
  confirmationMessage: string | null;
};

export type BookingPageSettingsView = BookingPageSettingsData & {
  backgroundAssetUrl: string | null;
  logoAssetUrl: string | null;
  sideMediaAssetUrl: string | null;
  companyName: string;
  ownerName: string | null;
};

export const BOOKING_ASSET_BUCKET = "booking-assets";

export const QUICK_ACCENTS = [
  { key: "coral", label: "Corail", value: "#e8663c" },
  { key: "red", label: "Rouge", value: "#ef4444" },
  { key: "amber", label: "Ambre", value: "#f59e0b" },
  { key: "emerald", label: "Émeraude", value: "#10b981" },
  { key: "sky", label: "Ciel", value: "#0ea5e9" },
  { key: "indigo", label: "Indigo", value: "#6366f1" },
  { key: "violet", label: "Violet", value: "#8b5cf6" },
  { key: "pink", label: "Rose", value: "#ec4899" },
] as const;

export type BookingBackgroundPreset = {
  key: string;
  label: string;
  category: "gradients" | "textures" | "office" | "solid";
  background: string;
};

// Presets are CSS backgrounds instead of per-user files: they are stable,
// cacheable and never add rows or storage objects for an account.
export const BOOKING_BACKGROUND_PRESETS: BookingBackgroundPreset[] = [
  { key: "ember", label: "Braise douce", category: "gradients", background: "linear-gradient(135deg, #251515 0%, #773d2c 48%, #17181d 100%)" },
  { key: "midnight", label: "Minuit", category: "gradients", background: "linear-gradient(135deg, #111827 0%, #243b53 52%, #0f172a 100%)" },
  { key: "ocean", label: "Océan calme", category: "gradients", background: "linear-gradient(135deg, #082f49 0%, #155e75 50%, #164e63 100%)" },
  { key: "plum", label: "Prune", category: "gradients", background: "linear-gradient(135deg, #24132f 0%, #5b2b62 52%, #171321 100%)" },
  { key: "grain", label: "Grain graphite", category: "textures", background: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.14) 0 1px, transparent 1px 100%), linear-gradient(135deg, #191a1d, #34363c)" },
  { key: "aurora", label: "Aurore", category: "textures", background: "radial-gradient(circle at 75% 25%, rgba(68, 211, 169, .35), transparent 36%), radial-gradient(circle at 20% 80%, rgba(97, 115, 255, .32), transparent 38%), #111827" },
  { key: "paper", label: "Papier chaud", category: "textures", background: "radial-gradient(circle at 1px 1px, rgba(74,67,55,.1) 1px, transparent 0) 0 0 / 18px 18px, #e9e2d4" },
  { key: "sand", label: "Sable", category: "textures", background: "radial-gradient(circle at 75% 20%, rgba(255,255,255,.32), transparent 30%), linear-gradient(145deg, #c9aa80, #806d5b)" },
  { key: "studio", label: "Studio", category: "office", background: "linear-gradient(115deg, rgba(9,14,21,.3), rgba(9,14,21,.82)), linear-gradient(135deg, #8b9aab 0%, #364554 55%, #121a24 100%)" },
  { key: "ledger", label: "Ledger", category: "office", background: "linear-gradient(135deg, #17231d 0%, #2d4a36 54%, #101713 100%)" },
  { key: "window", label: "Fenêtre", category: "office", background: "linear-gradient(135deg, #c8d8dc 0%, #7dabb1 44%, #253d43 100%)" },
  { key: "ink", label: "Encre", category: "solid", background: "#101114" },
  { key: "slate", label: "Ardoise", category: "solid", background: "#29313a" },
  { key: "ivory", label: "Ivoire", category: "solid", background: "#f1eee6" },
];

export const DEFAULT_BOOKING_PAGE_SETTINGS: BookingPageSettingsData = {
  theme: "dark",
  accentColor: "#e8663c",
  backgroundType: "none",
  backgroundKey: null,
  backgroundUrl: null,
  overlayOpacity: 40,
  backgroundPosition: "center",
  logoUrl: null,
  showCompanyName: true,
  sideMediaType: "none",
  sideMediaUrl: null,
  sideMediaCaption: null,
  title: null,
  subtitle: null,
  emoji: null,
  confirmationMessage: null,
};

export function getBookingPreset(key: string | null | undefined): BookingBackgroundPreset | null {
  if (!key) return null;
  return BOOKING_BACKGROUND_PRESETS.find((preset) => preset.key === key) ?? null;
}

export function isBookingPresetKey(value: string | null | undefined): boolean {
  return value === null || value === undefined || getBookingPreset(value) !== null;
}

export function normalizeBookingPageSettings(input: Partial<BookingPageSettingsData>): BookingPageSettingsData {
  const accentColor = isHexColor(input.accentColor) ? input.accentColor.toLowerCase() : DEFAULT_BOOKING_PAGE_SETTINGS.accentColor;
  const backgroundType = input.backgroundType === "preset" || input.backgroundType === "upload" ? input.backgroundType : "none";
  const sideMediaType = input.sideMediaType === "image" || input.sideMediaType === "video" || input.sideMediaType === "embed" ? input.sideMediaType : "none";
  const backgroundKey = isBookingPresetKey(input.backgroundKey) ? input.backgroundKey ?? null : null;
  const overlayOpacity = typeof input.overlayOpacity === "number" && Number.isInteger(input.overlayOpacity)
    ? Math.min(70, Math.max(0, input.overlayOpacity))
    : DEFAULT_BOOKING_PAGE_SETTINGS.overlayOpacity;

  return {
    theme: input.theme === "light" ? "light" : "dark",
    accentColor,
    backgroundType,
    backgroundKey: backgroundType === "preset" ? backgroundKey : null,
    backgroundUrl: typeof input.backgroundUrl === "string" && input.backgroundUrl.trim() ? input.backgroundUrl.trim() : null,
    overlayOpacity,
    backgroundPosition: input.backgroundPosition === "top" || input.backgroundPosition === "bottom" ? input.backgroundPosition : "center",
    logoUrl: typeof input.logoUrl === "string" && input.logoUrl.trim() ? input.logoUrl.trim() : null,
    showCompanyName: input.showCompanyName !== false,
    sideMediaType,
    sideMediaUrl: typeof input.sideMediaUrl === "string" && input.sideMediaUrl.trim() ? input.sideMediaUrl.trim() : null,
    sideMediaCaption: typeof input.sideMediaCaption === "string" && input.sideMediaCaption.trim() ? input.sideMediaCaption.trim() : null,
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : null,
    subtitle: typeof input.subtitle === "string" && input.subtitle.trim() ? input.subtitle.trim() : null,
    emoji: typeof input.emoji === "string" && input.emoji.trim() ? input.emoji.trim() : null,
    confirmationMessage: typeof input.confirmationMessage === "string" && input.confirmationMessage.trim() ? input.confirmationMessage.trim() : null,
  };
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(value: string): Rgb | null {
  if (!isHexColor(value)) return null;
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function linearize(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function contrastRatio(first: string, second: string): number {
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  if (!firstRgb || !secondRgb) return 1;
  const firstLuminance = 0.2126 * linearize(firstRgb.r) + 0.7152 * linearize(firstRgb.g) + 0.0722 * linearize(firstRgb.b);
  const secondLuminance = 0.2126 * linearize(secondRgb.r) + 0.7152 * linearize(secondRgb.g) + 0.0722 * linearize(secondRgb.b);
  const brighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (brighter + 0.05) / (darker + 0.05);
}

export function getAccentTextColor(accentColor: string): "#111111" | "#ffffff" {
  return contrastRatio(accentColor, "#ffffff") >= contrastRatio(accentColor, "#111111") ? "#ffffff" : "#111111";
}

function mixHex(first: string, second: string, amount: number): string {
  const firstRgb = hexToRgb(first) ?? { r: 232, g: 102, b: 60 };
  const secondRgb = hexToRgb(second) ?? { r: 255, g: 255, b: 255 };
  const channel = (a: number, b: number) => Math.round(a + (b - a) * amount).toString(16).padStart(2, "0");
  return `#${channel(firstRgb.r, secondRgb.r)}${channel(firstRgb.g, secondRgb.g)}${channel(firstRgb.b, secondRgb.b)}`;
}

export function getAccentContrast(accentColor: string, theme: BookingTheme): {
  textColor: "#111111" | "#ffffff";
  ratio: number;
  warning: boolean;
  suggestedAccent: string;
} {
  const safeAccent = isHexColor(accentColor) ? accentColor : DEFAULT_BOOKING_PAGE_SETTINGS.accentColor;
  const textColor = getAccentTextColor(safeAccent);
  const ratio = contrastRatio(safeAccent, textColor);
  const target = theme === "dark" ? "#ffffff" : "#111111";
  let suggestedAccent = safeAccent;
  for (let step = 1; step <= 12 && contrastRatio(suggestedAccent, getAccentTextColor(suggestedAccent)) < 4.5; step += 1) {
    suggestedAccent = mixHex(safeAccent, target, step / 12);
  }
  return { textColor, ratio, warning: ratio < 4.5, suggestedAccent };
}

export function getBookingAppearance(settings: Pick<BookingPageSettingsData, "theme" | "accentColor" | "backgroundType" | "backgroundKey" | "backgroundPosition" | "overlayOpacity">, backgroundAssetUrl: string | null) {
  const contrast = getAccentContrast(settings.accentColor, settings.theme);
  const dark = settings.theme === "dark";
  const pageBackground = dark ? "#0d0f12" : "#f6f5f1";
  let accentReadable = contrast.suggestedAccent;
  const readableSurface = dark ? "#272a2f" : "#ffffff";
  for (let step = 1; step <= 12 && contrastRatio(accentReadable, readableSurface) < 4.5; step += 1) {
    accentReadable = mixHex(settings.accentColor, dark ? "#ffffff" : "#111111", step / 12);
  }
  const preset = settings.backgroundType === "preset" ? getBookingPreset(settings.backgroundKey) : null;
  const backgroundSource = settings.backgroundType === "upload" ? backgroundAssetUrl : preset?.background;
  const overlay = `rgba(0, 0, 0, ${settings.overlayOpacity / 100})`;

  return {
    accent: isHexColor(settings.accentColor) ? settings.accentColor : DEFAULT_BOOKING_PAGE_SETTINGS.accentColor,
    accentText: contrast.textColor,
    accentReadable,
    success: dark ? "#8ee6a0" : "#28703b",
    pageBackground,
    surface: dark ? "#171a1f" : "#ffffff",
    mutedSurface: dark ? "rgba(255,255,255,.07)" : "#f0efeb",
    foreground: dark ? "#f7f7f4" : "#171714",
    muted: dark ? "#b7b8b3" : "#625f58",
    border: dark ? "rgba(255,255,255,.16)" : "#d8d6cf",
    backgroundImage: backgroundSource ? `linear-gradient(${overlay}, ${overlay}), ${backgroundSource}` : undefined,
    backgroundPosition: settings.backgroundPosition,
  };
}

export function getSafeBookingEmbedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      const id = parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (hostname === "vimeo.com" || hostname.endsWith(".vimeo.com")) {
      const id = parsed.pathname.match(/\/(\d+)(?:$|\/)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function getBookingBackgroundStyle(settings: BookingPageSettingsData, backgroundAssetUrl: string | null) {
  return getBookingAppearance(settings, backgroundAssetUrl);
}
