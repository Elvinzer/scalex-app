import { getAccountContext } from "@/lib/team/context";

export type NativeBookingViewer = {
  userId: string;
  accountId: string;
  isAccountWide: boolean;
};

export async function getNativeBookingViewer(userId: string): Promise<NativeBookingViewer | null> {
  const context = await getAccountContext(userId);
  if (!context) return null;

  return {
    userId,
    accountId: context.accountId,
    // The current permission model grants account-wide booking management to
    // the owner. Delegated members keep a personal closer scope.
    isAccountWide: context.isOwner,
  };
}

export function viewerCloserIds(viewer: NativeBookingViewer, requestedIds?: string[]): string[] | undefined {
  if (viewer.isAccountWide) return requestedIds;
  return [viewer.userId];
}
