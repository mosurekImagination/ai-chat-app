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
  onSend: (content: string, attachmentId?: string) => void;
  onUploadFile?: (file: File) => Promise<string | undefined>;
}

export function MessageInput({
  roomName,
  disabled,
  disabledReason,
  replyingTo,
  onCancelReply,
  onSend,
  onUploadFile,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  if (disabled) {
    return (
      <div className="m-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledReason ?? "You cannot send messages in this conversation."}
      </div>
    );
  }

  const submit = async () => {
    if (!value.trim() && !pendingFile) return;
    let attachmentId: string | undefined;
    if (pendingFile && onUploadFile) {
      setUploading(true);
      try {
        attachmentId = await onUploadFile(pendingFile);
      } finally {
        setUploading(false);
        setPendingFile(null);
      }
    }
    onSend(value.trim(), attachmentId);
    setValue("");
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const named = new File([file], `paste-${Date.now()}.png`, { type: file.type });
          setPendingFile(named);
        }
        break;
      }
    }
  };

  return (
    <div className="px-3 pb-3">
      {replyingTo && (
        <div className="flex items-center gap-2 rounded-t-md border border-b-0 border-border bg-input-surface px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Replying to</span>
          <span className="font-semibold text-primary">
            {replyingTo.sender?.username ?? "Deleted User"}
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
      {pendingFile && (
        <div className="flex items-center gap-2 rounded-t-md border border-b-0 border-border bg-input-surface px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 truncate text-muted-foreground">{pendingFile.name}</span>
          <button
            onClick={() => setPendingFile(null)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        className={cn(
          "flex items-end gap-2 rounded-md border border-border bg-input-surface p-2",
          (replyingTo || pendingFile) && "rounded-t-none",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          aria-label="Attach file input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPendingFile(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Attach file"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={handlePaste}
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
          disabled={(!value.trim() && !pendingFile) || uploading}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
