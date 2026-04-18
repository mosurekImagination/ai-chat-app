import { useState } from "react";
import { Reply, Pencil, Trash2, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/mockData";
import type { Message } from "@/lib/types";

interface MessageItemProps {
  message: Message;
  onReply?: (m: Message) => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageItem({ message, onReply }: MessageItemProps) {
  const [hover, setHover] = useState(false);
  const isMine = message.sender?.userId === currentUser.userId;
  const senderName = message.sender?.username ?? "deleted user";

  return (
    <div
      className="group relative flex gap-3 rounded-md px-3 py-1.5 transition-colors hover:bg-accent/40"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-foreground">
        {senderName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{senderName}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>

        {message.parentMessage && (
          <div className="mb-1 mt-0.5 border-l-2 border-primary pl-2 text-sm text-muted-foreground">
            <span className="text-xs font-medium text-primary">
              ↪ {message.parentMessage.sender?.username ?? "deleted user"}
            </span>{" "}
            <span className="line-clamp-1">
              {message.parentMessage.content === null ? (
                <em className="text-muted-foreground">Original message deleted</em>
              ) : (
                message.parentMessage.content
              )}
            </span>
          </div>
        )}

        {message.deleted ? (
          <div className="text-sm italic text-muted-foreground">This message was deleted</div>
        ) : (
          <>
            {message.content && (
              <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                {message.content}
                {message.editedAt && (
                  <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
                )}
              </div>
            )}
            {message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.attachments.map((a) => {
                  if (a.mimeType.startsWith("image/")) {
                    return (
                      <div
                        key={a.id}
                        className="flex h-48 w-full max-w-sm items-center justify-center rounded-md border border-border bg-muted/40 text-xs text-muted-foreground"
                      >
                        🖼 {a.originalFilename}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={a.id}
                      className="flex max-w-sm items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                    >
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.originalFilename}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(a.sizeBytes)}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Hover actions */}
      {hover && !message.deleted && (
        <div
          className={cn(
            "absolute -top-3 right-3 flex gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-md",
          )}
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onReply?.(message)}
            aria-label="Reply"
          >
            <Reply className="h-3.5 w-3.5" />
          </Button>
          {isMine && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
