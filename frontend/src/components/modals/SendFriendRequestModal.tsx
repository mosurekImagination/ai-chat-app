import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendService } from "@/lib/services/friendService";

interface SendFriendRequestModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillUsername?: string;
}

export function SendFriendRequestModal({ open, onOpenChange, prefillUsername }: SendFriendRequestModalProps) {
  const [username, setUsername] = useState(prefillUsername ?? "");
  const queryClient = useQueryClient();

  // Sync prefill when modal opens with a pre-selected username
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setUsername(prefillUsername ?? ""); }, [open]);

  const mutation = useMutation({
    mutationFn: (u: string) => friendService.sendRequest(u),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingRequests"] });
      toast.success("Friend request sent");
      setUsername("");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      const msg = err.message;
      if (msg.includes("ALREADY_FRIENDS")) toast.error("Already friends");
      else if (msg.includes("FRIEND_REQUEST_EXISTS")) toast.error("Request already sent");
      else if (msg.includes("NOT_FOUND")) toast.error("User not found");
      else toast.error("Failed to send request");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a friend</DialogTitle>
          <DialogDescription>
            Enter their username — we'll send a friend request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 pt-2">
          <Label htmlFor="friend-username">Username</Label>
          <Input
            id="friend-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. bob"
            onKeyDown={(e) => {
              if (e.key === "Enter" && username.trim()) mutation.mutate(username.trim());
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(username.trim())}
            disabled={!username.trim() || mutation.isPending}
          >
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
