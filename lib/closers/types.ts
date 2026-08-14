export type CloserStatus = "owner" | "active" | "invited";

export type CloserRow = {
  userId: string | null;
  memberId: string | null;
  name: string;
  email: string;
  status: CloserStatus;
  isOwner: boolean;
};

export type ActiveCloser = {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
};
