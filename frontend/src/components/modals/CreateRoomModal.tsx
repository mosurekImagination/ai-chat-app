import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Hash, Lock } from "lucide-react";
import { roomService } from "@/lib/services/roomService";
import { ApiError } from "@/lib/api";

interface CreateRoomModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateRoomModal({ open, onOpenChange }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation({
    mutationFn: () =>
      roomService.createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      }),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["myRooms"] });
      queryClient.invalidateQueries({ queryKey: ["publicRooms"] });
      setName("");
      setDescription("");
      setVisibility("PUBLIC");
      setError(null);
      onOpenChange(false);
      toast.success(`Room created`, {
        description: `#${room.name} is ready — invite people to join.`,
      });
      navigate({ to: "/rooms/$id", params: { id: String(room.id) } });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "DUPLICATE_ROOM_NAME") {
        setError("A room with this name already exists.");
      } else {
        setError("Failed to create room. Please try again.");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a room</DialogTitle>
          <DialogDescription>Rooms are where conversations happen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="room-name">Name</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="general"
              maxLength={50}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-desc">Description</Label>
            <Textarea
              id="room-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this room about?"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <div className="grid grid-cols-2 gap-2">
              <VisibilityOption
                active={visibility === "PUBLIC"}
                onClick={() => setVisibility("PUBLIC")}
                icon={<Hash className="h-4 w-4" />}
                title="Public"
                hint="Anyone can join."
              />
              <VisibilityOption
                active={visibility === "PRIVATE"}
                onClick={() => setVisibility("PRIVATE")}
                icon={<Lock className="h-4 w-4" />}
                title="Private"
                hint="Invite-only."
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating…" : "Create room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisibilityOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-accent",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
