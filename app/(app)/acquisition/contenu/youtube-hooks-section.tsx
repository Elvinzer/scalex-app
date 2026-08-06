import { InfoPopover } from "@/components/info-popover";
import {
  aggregateSearchTerms,
  aggregateTrafficSources,
  averageHookRetention,
  dropOffSeconds,
  formatTimecode,
  hasUsableRetention,
  hookRetention,
  medianDropOffSeconds,
} from "@/lib/youtube/retention";
import { YOUTUBE_RETENTION_MIN_VIEWS } from "@/lib/youtube/protocol";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

const NUMBER = new Intl.NumberFormat("fr-FR");
const PERCENT = (value: number) => `${Math.round(value * 100)}%`;

// Famille 2 — "Ce qui fait cliquer et regarder".
//
// The spec's centerpiece was per-video CTR, which this integration cannot
// obtain: thumbnail impressions/CTR aren't exposed by the real-time
// Analytics API (see protocol.ts's YOUTUBE_THUMBNAIL_CTR_AVAILABLE, probed
// against the live API). Retention answers the same question — "what holds
// people?" — with data that genuinely exists, so it carries this section
// instead of a column of dashes.
//
// Everything here is computed from the raw 100-point retention curve at read
// time; no rate is stored (CLAUDE.md).
export function YoutubeHooksSection({ videos }: { videos: YoutubeVideoInsightRow[] }) {
  // Videos too small to read: a curve from a handful of sessions is noise.
  // Excluded from every figure below rather than shown in red — the spec's
  // "vidéo sans données suffisantes : exclue des classements, pas peinte en
  // rouge".
  const measurable = videos.filter(hasUsableRetention);
  if (measurable.length === 0) {
    const importedRetention = videos.filter(
      (video) => (video.views ?? 0) >= YOUTUBE_RETENTION_MIN_VIEWS && video.averageViewPercentage !== null
    );
    if (importedRetention.length > 0) return <ImportedRetentionFallback videos={importedRetention} />;

    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Ce qui fait cliquer et regarder</h2>
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Pas encore assez de données de rétention</p>
          <p className="mt-1 text-sm text-muted-foreground">
            L&apos;analyse démarre dès qu&apos;une vidéo dépasse {NUMBER.format(YOUTUBE_RETENTION_MIN_VIEWS)} vues. Les courbes se
            récupèrent à chaque synchronisation, sur tes vidéos les plus vues.
          </p>
        </div>
      </div>
    );
  }

  const medianDropOff = medianDropOffSeconds(measurable);
  const avgHook = averageHookRetention(measurable);
  const trafficSources = aggregateTrafficSources(measurable);
  const searchTerms = aggregateSearchTerms(measurable);

  // Best/worst hook — the actionable pair. Only videos long enough to HAVE a
  // 30s hook qualify.
  const withHook = measurable
    .map((video) => ({ video, hook: hookRetention(video) }))
    .filter((entry): entry is { video: YoutubeVideoInsightRow; hook: number } => entry.hook !== null)
    .sort((a, b) => b.hook - a.hook);
  const bestHook = withHook[0];
  const worstHook = withHook.length > 1 ? withHook[withHook.length - 1] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold">Ce qui fait cliquer et regarder</h2>
        <p className="text-xs text-muted-foreground">
          Sur {measurable.length} vidéo{measurable.length > 1 ? "s" : ""} avec assez de données
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">Décrochage médian</p>
            <InfoPopover text="Le moment où tu perds la moitié de ton audience, mesuré sur la vraie courbe de rétention de chaque vidéo. Médiane et non moyenne : une seule vidéo qui décroche à 5 secondes ne doit pas fausser le chiffre." />
          </div>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {medianDropOff === null ? "—" : formatTimecode(medianDropOff)}
          </p>
          {medianDropOff !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {medianDropOff < 30
                ? "Sous 30 s : c'est ton accroche qui lâche, pas ton contenu."
                : "Après l'accroche : regarde où le rythme retombe."}
            </p>
          )}
        </div>

        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">Rétention à 30 s</p>
            <InfoPopover text="Part des spectateurs encore présents après 30 secondes — la fenêtre où se joue l'accroche. Les vidéos de moins de 30 secondes sont exclues : il n'y a pas d'« après 30 s » à mesurer." />
          </div>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{avgHook === null ? "—" : PERCENT(avgHook)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Moyenne de tes vidéos mesurables</p>
        </div>

        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Première source de vues</p>
          <p className="mt-2 font-display text-2xl font-bold">{trafficSources[0]?.label ?? "—"}</p>
          {trafficSources[0] && (
            <p className="mt-1 text-xs text-muted-foreground">{PERCENT(trafficSources[0].share)} de tes vues mesurées</p>
          )}
        </div>
      </div>

      {bestHook && (
        <div className="sticker-card flex flex-col gap-3 p-5">
          <p className="text-sm font-bold">Tes accroches</p>
          <div className="flex flex-col gap-2">
            <HookRow label="Meilleure accroche" video={bestHook.video} hook={bestHook.hook} tone="healthy" />
            {worstHook && <HookRow label="À retravailler" video={worstHook.video} hook={worstHook.hook} tone="critical" />}
          </div>
          {worstHook && (
            <p className="text-xs text-muted-foreground">
              Écart de {PERCENT(bestHook.hook - worstHook.hook)} de rétention à 30 s entre les deux. Regarde comment tu ouvres
              « {bestHook.video.title} » et applique la même structure.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {trafficSources.length > 0 && (
          <div className="sticker-card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold">D&apos;où viennent tes vues</p>
              <InfoPopover text="Réparti par YouTube sur tes vidéos les plus vues. « Recherche » signifie qu'on te trouve activement ; « Vidéos suggérées » que l'algorithme te pousse." />
            </div>
            <div className="flex flex-col gap-2">
              {trafficSources.slice(0, 5).map((source) => (
                <div key={source.source} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold">{source.label}</span>
                    <span className="tabular-nums text-muted-foreground">{PERCENT(source.share)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(source.share * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchTerms.length > 0 && (
          <div className="sticker-card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold">Ce qu&apos;on tape pour te trouver</p>
              <InfoPopover text="Les vraies requêtes YouTube qui ont amené des vues sur tes vidéos — la matière la plus fiable pour choisir ton prochain sujet." />
            </div>
            <div className="flex flex-wrap gap-2">
              {searchTerms.map((term) => (
                <span
                  key={term.term}
                  className="rounded-full border border-border px-3 py-1 text-sm font-bold"
                  title={`${NUMBER.format(term.views)} vues`}
                >
                  {term.term}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{NUMBER.format(term.views)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportedRetentionFallback({ videos }: { videos: YoutubeVideoInsightRow[] }) {
  const average = videos.reduce((sum, video) => sum + (video.averageViewPercentage ?? 0), 0) / videos.length;
  const best = [...videos].sort((a, b) => (b.averageViewPercentage ?? 0) - (a.averageViewPercentage ?? 0)).slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold">Ce qui fait cliquer et regarder</h2>
        <p className="text-xs text-muted-foreground">
          Sur {videos.length} vidéo{videos.length > 1 ? "s" : ""} déjà analysée{videos.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="sticker-card flex flex-col gap-4 p-5">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-muted-foreground">Rétention moyenne importée</p>
          <InfoPopover text="Pourcentage moyen regardé par les spectateurs, déjà récupéré depuis YouTube pour tes vidéos qui dépassent le seuil de 100 vues." />
        </div>
        <p className="font-display text-3xl font-bold tabular-nums">{Math.round(average * 10) / 10}%</p>
        <p className="text-sm text-muted-foreground">
          Tes vidéos sont bien analysées. Les courbes détaillées seront récupérées au prochain rafraîchissement YouTube ; les chiffres
          ci-dessus restent déjà utilisables pour comparer tes formats.
        </p>
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm font-bold">Meilleures rétentions importées</p>
          {best.map((video) => (
            <div key={video.videoId} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{video.title}</span>
              <span className="shrink-0 font-bold tabular-nums">{Math.round(video.averageViewPercentage ?? 0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HookRow({
  label,
  video,
  hook,
  tone,
}: {
  label: string;
  video: YoutubeVideoInsightRow;
  hook: number;
  tone: "healthy" | "critical";
}) {
  const drop = dropOffSeconds(video);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border p-3">
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
        <a
          href={`https://www.youtube.com/watch?v=${video.videoId}`}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-1 font-bold hover:underline"
        >
          {video.title}
        </a>
        {drop !== null && <p className="text-xs text-muted-foreground">Décroche à {formatTimecode(drop)}</p>}
      </div>
      <p
        className={`shrink-0 font-display text-2xl font-bold tabular-nums ${
          tone === "healthy" ? "text-state-healthy" : "text-state-critical"
        }`}
      >
        {PERCENT(hook)}
      </p>
    </div>
  );
}
