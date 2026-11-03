"use client";

const pendingChanges = new Set<symbol>();

export function setBusinessChangePending(key: symbol, pending: boolean) {
  if (pending) pendingChanges.add(key);
  else pendingChanges.delete(key);
}

export function hasPendingBusinessChanges() {
  return pendingChanges.size > 0;
}
