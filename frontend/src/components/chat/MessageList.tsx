import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MessageItem } from "./MessageItem";
import { SkeletonRow } from "@/components/common/SkeletonRow";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  onReply: (m: Message) => void;
  /** Async loader for older messages. Resolve with the page (oldest-first). Resolve `[]` when nothing more. */
  loadOlder?: (beforeId: number) => Promise<Message[]>;
  /** Called once when the user enters the room — used to clear the unread cursor. */
  onEnter?: () => void;
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const NEAR_BOTTOM_PX = 20;

export function MessageList({ messages, onReply, loadOlder, onEnter }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevLengthRef = useRef(messages.length);
  const prevFirstIdRef = useRef<number | null>(messages[0]?.id ?? null);
  const wasAtBottomRef = useRef(true);

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  // Fire onEnter once when this list mounts for a room.
  useEffect(() => {
    onEnter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setUnseenCount(0);
  }, []);

  // Initial scroll to bottom on mount.
  useLayoutEffect(() => {
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track whether the user is near the bottom.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - NEAR_BOTTOM_PX;
    wasAtBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom && unseenCount !== 0) setUnseenCount(0);
  }, [unseenCount]);

  // Handle changes to the messages array: distinguish prepend vs append.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const prevLen = prevLengthRef.current;
    const prevFirstId = prevFirstIdRef.current;
    const currLen = messages.length;
    const currFirstId = messages[0]?.id ?? null;

    if (currLen > prevLen && prevFirstId !== null && currFirstId !== prevFirstId) {
      // Prepend: preserve scroll position relative to the previous top.
      const prevHeight = prevScrollHeightRef.current ?? el.scrollHeight;
      const newHeight = el.scrollHeight;
      el.scrollTop = newHeight - prevHeight;
    } else if (currLen > prevLen) {
      // Append: auto-scroll if the user was at the bottom, else show "new messages" pill.
      const appended = currLen - prevLen;
      if (wasAtBottomRef.current) {
        scrollToBottom("auto");
      } else {
        setUnseenCount((c) => c + appended);
      }
    }

    prevLengthRef.current = currLen;
    prevFirstIdRef.current = currFirstId;
    prevScrollHeightRef.current = null;
  }, [messages, scrollToBottom]);

  // Infinite scroll: observe the top sentinel.
  useEffect(() => {
    if (!loadOlder) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;
        if (loadingOlder || !hasMore) return;
        const oldest = messages[0];
        if (!oldest) return;

        setLoadingOlder(true);
        // Snapshot scroll height so we can preserve position after prepend.
        prevScrollHeightRef.current = root.scrollHeight;
        try {
          const older = await loadOlder(oldest.id);
          if (older.length === 0) setHasMore(false);
        } finally {
          setLoadingOlder(false);
        }
      },
      { root, rootMargin: "200px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlder, loadingOlder, hasMore, messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-2xl">
          💬
        </div>
        <h3 className="text-base font-semibold text-foreground">No messages yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">Say hello!</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-thin flex-1 overflow-y-auto py-3"
      >
        {/* Top sentinel + loading skeleton for older pages */}
        {hasMore && loadOlder && (
          <div ref={sentinelRef} className="px-3 pb-2">
            {loadingOlder && (
              <div className="space-y-2">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}
          </div>
        )}
        {!hasMore && (
          <div className="px-3 pb-3 pt-1 text-center text-xs text-muted-foreground">
            Beginning of conversation
          </div>
        )}

        {messages.map((m, i) => {
          const showDay = i === 0 || !isSameDay(messages[i - 1].createdAt, m.createdAt);
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex items-center gap-3 px-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDay(m.createdAt)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <MessageItem message={m} onReply={onReply} />
            </div>
          );
        })}
      </div>

      {/* "↓ New messages" pill */}
      {!atBottom && unseenCount > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className={cn(
            "absolute bottom-3 left-1/2 z-10 -translate-x-1/2",
            "flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg",
            "transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {unseenCount} new {unseenCount === 1 ? "message" : "messages"}
        </button>
      )}
    </div>
  );
}
