import { useState } from "react";
import { toast } from "sonner";
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

interface SendFriendRequestModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SendFriendRequestModal({ open, onOpenChange }: SendFriendRequestModalProps) {
  const [username, setUsername] = useState("");

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
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const trimmed = username.trim();
              if (!trimmed) return;
              toast.success("Friend request sent", {
                description: `We'll let you know when ${trimmed} responds.`,
              });
              setUsername("");
              onOpenChange(false);
            }}
            disabled={!username.trim()}
          >
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
