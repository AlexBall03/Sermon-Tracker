import { channelName, ownershipMessage, type OwnershipMessage } from "./model";

/*
 * The takeover channel (A2.3B.3). Web Locks give the tab holding a lock no
 * way to learn that another tab wants it, short of polling; this carries
 * that request, and the answer, between tabs of one browser profile.
 *
 * It is advice, never authority. The lock alone decides who edits, and the
 * server who saves. A message lost, delayed, repeated, or out of order can
 * only make a takeover end `unanswered`; it can never make two editors.
 * Messages carry identifiers only (owner, outline, request), never content,
 * and anything that does not parse, or names another owner or outline, is
 * ignored.
 */

export type ChannelLike = {
  postMessage(message: unknown): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
};

export type ChannelFactory = () => ChannelLike | null;

export const browserChannel: ChannelFactory = () =>
  typeof BroadcastChannel === "undefined"
    ? null
    : (new BroadcastChannel(channelName) as unknown as ChannelLike);

export type OwnershipChannel = {
  /** Asks the editing tab to hand over. */
  request(requestId: string): void;
  answer(
    requestId: string,
    answer: "releasing" | "declined",
    reason?: "unprotected" | "starting",
  ): void;
  close(): void;
};

type Answer = Extract<OwnershipMessage, { type: "takeover_answer" }>;

export function openOwnershipChannel({
  factory,
  owner,
  outlineId,
  onRequest,
  onAnswer,
}: {
  factory: ChannelFactory;
  owner: string;
  outlineId: string;
  onRequest(requestId: string): void;
  onAnswer(answer: Pick<Answer, "requestId" | "answer" | "reason">): void;
}): OwnershipChannel {
  let channel: ChannelLike | null = null;
  try {
    channel = factory();
  } catch {
    channel = null;
  }
  let closed = false;
  // A repeated request or answer is told once.
  const seen = new Set<string>();

  const listener = (event: { data: unknown }) => {
    if (closed) return;
    const parsed = ownershipMessage.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.owner !== owner || message.outlineId !== outlineId) return;
    const key = `${message.type}:${message.requestId}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (message.type === "takeover_request") onRequest(message.requestId);
    else onAnswer({ requestId: message.requestId, answer: message.answer, reason: message.reason });
  };
  channel?.addEventListener("message", listener);

  const post = (message: OwnershipMessage) => {
    if (closed || !channel) return;
    try {
      channel.postMessage(message);
    } catch {
      // A message that cannot be sent is a message lost: the takeover ends unanswered.
    }
  };

  return {
    request(requestId) {
      post({ v: 1, type: "takeover_request", owner, outlineId, requestId });
    },
    answer(requestId, answer, reason) {
      post({
        v: 1,
        type: "takeover_answer",
        owner,
        outlineId,
        requestId,
        answer,
        ...(reason ? { reason } : {}),
      });
    },
    close() {
      if (closed) return;
      closed = true;
      channel?.removeEventListener("message", listener);
      try {
        channel?.close();
      } catch {
        // Already closed.
      }
    },
  };
}
