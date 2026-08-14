import { z } from "zod";

import {
  isBookingPresetKey,
  isHexColor,
} from "./config";

const storagePathSchema = z.string().trim().max(512).nullable();

export const bookingPageSettingsInputSchema = z
  .object({
    theme: z.enum(["light", "dark"]),
    accentColor: z.string().trim().refine(isHexColor, "Choisis une couleur hexadécimale valide."),
    backgroundType: z.enum(["none", "preset", "upload"]),
    backgroundKey: z.string().trim().max(80).nullable(),
    backgroundUrl: storagePathSchema,
    overlayOpacity: z.number().int().min(0).max(70),
    backgroundPosition: z.enum(["center", "top", "bottom"]),
    logoUrl: storagePathSchema,
    showCompanyName: z.boolean(),
    sideMediaType: z.enum(["none", "image", "video", "embed"]),
    sideMediaUrl: z.string().trim().max(2_048).nullable(),
    sideMediaCaption: z.string().trim().max(120).nullable(),
    title: z.string().trim().max(120).nullable(),
    subtitle: z.string().trim().max(240).nullable(),
    emoji: z.string().trim().max(8).nullable(),
    confirmationMessage: z.string().trim().max(300).nullable(),
  })
  .superRefine((value, context) => {
    if (value.backgroundType === "preset" && !isBookingPresetKey(value.backgroundKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["backgroundKey"], message: "Ce fond prédéfini n'existe pas." });
    }
    if (value.backgroundType === "upload" && !value.backgroundUrl) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["backgroundUrl"], message: "Ajoute une image de fond." });
    }
    if (value.sideMediaType !== "none" && !value.sideMediaUrl) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sideMediaUrl"], message: "Ajoute un média latéral." });
    }
    if (value.sideMediaType === "embed" && value.sideMediaUrl) {
      try {
        const url = new URL(value.sideMediaUrl);
        const hostname = url.hostname.toLowerCase();
        const allowed =
          hostname === "youtu.be" ||
          hostname === "youtube.com" ||
          hostname.endsWith(".youtube.com") ||
          hostname === "vimeo.com" ||
          hostname.endsWith(".vimeo.com");
        if (!allowed) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sideMediaUrl"], message: "Utilise un lien YouTube ou Vimeo." });
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["sideMediaUrl"], message: "Le lien vidéo n'est pas valide." });
      }
    }
    if (value.sideMediaType === "none" && (value.sideMediaUrl || value.sideMediaCaption)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sideMediaType"], message: "Sélectionne un type de média avant de renseigner ses détails." });
    }
  });

export type BookingPageSettingsInput = z.infer<typeof bookingPageSettingsInputSchema>;

export const bookingAssetKindSchema = z.enum(["background", "logo", "side-image", "side-video"]);

export const bookingAssetResponseSchema = z.union([
  z.object({ path: z.string().min(1), url: z.string().url().nullable() }),
  z.object({ error: z.string().min(1) }),
]);
