import { useState, useRef, useEffect } from "react";
import { Paperclip, Smile, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

interface MessageInputProps {
  roomName: string;
  disabled?: boolean;
  disabledReason?: string;
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSend: (content: string) => void;
}

export function MessageInput({
  roomName,
  disabled,
  disabledReason,
  replyingTo,
  onCancelReply,
  onSend,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyingTo) ref.current?.focus();
  }, [replyingTo]);

  if (disabled) {
    return (
      <div className="m-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledReason ?? "You cannot send messages in this conversation."}
      </div>
    );
  }

  const submit = () => {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className="px-3 pb-3">
      {replyingTo && (
        <div className="flex items-center gap-2 rounded-t-md border border-b-0 border-border bg-input-surface px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Replying to</span>
          <span className="font-semibold text-primary">
            {replyingTo.sender?.username ?? "deleted user"}
          </span>
          <span className="line-clamp-1 flex-1 text-muted-foreground">
            {replyingTo.content?.slice(0, 80) ?? "—"}
          </span>
          <button
            onClick={onCancelReply}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        className={cn(
          "flex items-end gap-2 rounded-md border border-border bg-input-surface p-2",
          replyingTo && "rounded-t-none",
        )}
      >
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Attach file">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${roomName}`}
          rows={1}
          className="min-h-[36px] max-h-32 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Emoji">
          <Smile className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
