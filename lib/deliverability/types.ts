export const JOURNEY_COLUMN_TYPES = ["entry", "progression", "risk", "success", "end"] as const;
export type ClientJourneyColumnType = (typeof JOURNEY_COLUMN_TYPES)[number];

export const JOURNEY_STATUSES = ["active", "completed", "abandoned"] as const;
export type ClientJourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const TESTIMONIAL_MEDIA_TYPES = ["photo", "video", "link", "text"] as const;
export type TestimonialMediaType = (typeof TESTIMONIAL_MEDIA_TYPES)[number];
