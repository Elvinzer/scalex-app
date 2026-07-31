"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { SalesCallRow } from "@/lib/iclosed/calls";

import { addCallComment, deleteCallComment, getCallComments, type CallComment } from "./comment-actions";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const STAMP_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function statusLabel(call: SalesCallRow): string {
  if (call.attendance === "cancelled") return "Annulé";
  if (call.attendance === "no_show") return "No-show";
  if (call.outcome === "closed") return "Closé";
  if (call.outcome === "not_closed") return "Non closé";
  if (call.outcome === "awaiting_decision") return "Attente décision";
  return new Date(call.scheduledAt).getTime() > Date.now() ? "À venir" : "À traiter";
}

export function CallDetailDrawer({
  call,
  open,
  onOpenChange,
}: {
  call: SalesCallRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [comments, setComments] = useState<CallComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const callId = call?.id ?? null;

  useEffect(() => {
    if (!open || !callId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getCallComments(callId).then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      setComments(res.comments);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, callId]);

  async function reload() {
    if (!callId) return;
    const res = await getCallComments(callId);
    if (res.error) setError(res.error);
    else setComments(res.comments);
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!callId) return;
    setError(null);
    const text = body;
    startTransition(async () => {
      const res = await addCallComment(callId, text);
      if (res.error) setError(res.error);
      else {
        setBody("");
        await reload();
      }
    });
  }

  function handleDelete(commentId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteCallComment(commentId);
      if (res.error) setError(res.error);
      else await reload();
    });
  }

  if (!call) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex items-center justify-between border-b border-border p-5">
          <DrawerTitle className="text-lg font-bold">{call.inviteeName ?? "Appel"}</DrawerTitle>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Fermer">
              ×
            </Button>
          </DrawerClose>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {call.inviteeEmail && <span>{call.inviteeEmail}</span>}
            <span>{DATE_FORMAT.format(new Date(call.scheduledAt))}</span>
            {call.closer && <span>Closer : {call.closer}</span>}
            <span className="flex items-center gap-2">
              <span className="font-bold text-foreground">{statusLabel(call)}</span>
              <span className="text-[10px] font-bold tracking-wide uppercase">
                {call.source === "calendly" ? "Calendly" : "iClosed"}
              </span>
            </span>
            {call.outcome === "closed" && (
              <span>
                Contracté : {call.contracted != null ? `${NUMBER_FORMAT.format(call.contracted)} €` : "—"} · Collecté :{" "}
                {call.collected != null ? `${NUMBER_FORMAT.format(call.collected)} €` : "—"}
              </span>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">Commentaires</p>

            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun commentaire pour l&apos;instant.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-[var(--radius-control)] border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold">{c.authorName}</p>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{STAMP_FORMAT.format(new Date(c.createdAt))}</span>
                        {c.isOwn && (
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            disabled={isPending}
                            aria-label="Supprimer"
                            className="text-muted-foreground hover:text-state-critical"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ajouter un commentaire (objection, relance, contexte…)"
              rows={3}
              className="resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
            {error && <p className="text-sm text-state-critical">{error}</p>}
            <Button type="submit" disabled={isPending || body.trim() === ""} className="self-end">
              {isPending ? "Enregistrement…" : "Ajouter"}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
