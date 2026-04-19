import { useState, useRef, useEffect } from "react";
import { Reply, Pencil, Trash2, FileText, Download, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import type { Message } from "@/lib/types";

interface MessageItemProps {
  message: Message;
  onReply?: (m: Message) => void;
  onEdit?: (messageId: number, newContent: string) => void;
  onDelete?: (messageId: number) => void;
  isAdmin?: boolean;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageItem({ message, onReply, onEdit, onDelete, isAdmin = false }: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content ?? "");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  const isMine = message.sender?.id === user?.userId;
  const canDelete = isMine || isAdmin;
  const senderName = message.sender?.username ?? "Deleted User";

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const saveEdit = () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      return;
    }
    onEdit?.(message.id, trimmed);
    setEditing(false);
  };

  return (
    <div
      className="group relative flex gap-3 rounded-md px-3 py-1.5 transition-colors hover:bg-accent/40"
      data-message-id={message.id}
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
              ↪ {message.parentMessage.sender?.username ?? "Deleted User"}
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
        ) : editing ? (
          <div className="mt-1 space-y-1">
            <Textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              className="min-h-[60px] resize-none text-sm"
              aria-label="Edit message"
            />
            <div className="flex gap-1">
              <Button size="sm" onClick={saveEdit} disabled={!editContent.trim()}>
                <Check className="mr-1 h-3.5 w-3.5" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </div>
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
                        <div className="text-xs text-muted-foreground">{formatBytes(a.sizeBytes)}</div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => window.open(`/api/files/${a.id}`, "_blank")}
                        aria-label="Download"
                      >
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

      {!message.deleted && !editing && (
        <div className={cn("absolute -top-3 right-3 hidden gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-md group-hover:flex")}>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onReply?.(message)} aria-label="Reply">
            <Reply className="h-3.5 w-3.5" />
          </Button>
          {isMine && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => { setEditContent(message.content ?? ""); setEditing(true); }}
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              onClick={() => onDelete?.(message.id)}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
