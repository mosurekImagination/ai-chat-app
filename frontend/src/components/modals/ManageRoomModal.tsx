import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Shield, Ban, ShieldOff, UserMinus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roomService } from "@/lib/services/roomService";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";

interface ManageRoomModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: number | null;
}

export function ManageRoomModal({ open, onOpenChange, roomId }: ManageRoomModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [settingName, setSettingName] = useState<string | null>(null);
  const [settingDesc, setSettingDesc] = useState<string | null>(null);
  const [settingVis, setSettingVis] = useState<string | null>(null);

  const { data: room } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => roomService.getRoom(roomId!),
    enabled: open && roomId != null,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", roomId],
    queryFn: () => roomService.getMembers(roomId!),
    enabled: open && roomId != null,
  });

  const { data: banned = [] } = useQuery({
    queryKey: ["bans", roomId],
    queryFn: () => roomService.getBanned(roomId!),
    enabled: open && roomId != null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["members", roomId] });
    queryClient.invalidateQueries({ queryKey: ["bans", roomId] });
    queryClient.invalidateQueries({ queryKey: ["myRooms"] });
  };

  const banMutation = useMutation({
    mutationFn: (userId: number) => roomService.banMember(roomId!, userId),
    onSuccess: invalidate,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: "ADMIN" | "MEMBER" }) =>
      roomService.updateMemberRole(roomId!, userId, role),
    onSuccess: invalidate,
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: number) => roomService.unbanUser(roomId!, userId),
    onSuccess: invalidate,
  });

  const inviteMutation = useMutation({
    mutationFn: () => roomService.inviteUser(roomId!, inviteUsername.trim()),
    onSuccess: () => setInviteUsername(""),
  });

  const updateRoomMutation = useMutation({
    mutationFn: () =>
      roomService.updateRoom(roomId!, {
        name: settingName ?? undefined,
        description: settingDesc ?? undefined,
        visibility: settingVis ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      queryClient.invalidateQueries({ queryKey: ["myRooms"] });
      setSettingName(null);
      setSettingDesc(null);
      setSettingVis(null);
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: () => roomService.deleteRoom(roomId!),
    onSuccess: () => {
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["myRooms"] });
      navigate({ to: "/rooms" });
    },
  });

  const isOwner = room?.ownerId === user?.userId;
  const admins = members.filter((m) => m.role === "ADMIN");
  const filteredMembers = members.filter((m) =>
    m.username.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const currentName = settingName ?? room?.name ?? "";
  const currentDesc = settingDesc ?? room?.description ?? "";
  const currentVis = settingVis ?? room?.visibility ?? "PUBLIC";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage #{room?.name ?? "room"}</DialogTitle>
          <DialogDescription>
            Manage members, admins, bans, invitations, and settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="members" className="mt-2">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="admins">Admins</TabsTrigger>
            <TabsTrigger value="banned">Banned</TabsTrigger>
            <TabsTrigger value="invites">Invitations</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* MEMBERS */}
          <TabsContent value="members" className="space-y-3 pt-4">
            <Input
              placeholder="Search members…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
              {filteredMembers.length === 0 ? (
                <EmptyRow text="No members match your search." />
              ) : (
                filteredMembers.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary-foreground">
                        {m.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{m.username}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.role === "ADMIN" ? "Admin" : "Member"}
                          {room?.ownerId === m.userId && " · owner"}
                        </div>
                      </div>
                    </div>
                    {room?.ownerId !== m.userId && (
                      <div className="flex items-center gap-2">
                        {isOwner && (
                          m.role === "MEMBER" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => roleMutation.mutate({ userId: m.userId, role: "ADMIN" })}
                              disabled={roleMutation.isPending}
                            >
                              <Shield className="mr-1 h-3.5 w-3.5" />
                              Make admin
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => roleMutation.mutate({ userId: m.userId, role: "MEMBER" })}
                              disabled={roleMutation.isPending}
                            >
                              <ShieldOff className="mr-1 h-3.5 w-3.5" />
                              Remove admin
                            </Button>
                          )
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => banMutation.mutate(m.userId)}
                          disabled={banMutation.isPending}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" />
                          Ban
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ADMINS */}
          <TabsContent value="admins" className="space-y-2 pt-4">
            {admins.length === 0 ? (
              <EmptyRow text="No admins." />
            ) : (
              admins.map((a) => (
                <div
                  key={a.userId}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary/20 text-primary-foreground">ADMIN</Badge>
                    <span className="text-sm font-medium">{a.username}</span>
                    {room?.ownerId === a.userId && (
                      <span className="text-xs text-muted-foreground">(cannot lose admin rights)</span>
                    )}
                  </div>
                  {isOwner && room?.ownerId !== a.userId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => roleMutation.mutate({ userId: a.userId, role: "MEMBER" })}
                      disabled={roleMutation.isPending}
                    >
                      <UserMinus className="mr-1 h-3.5 w-3.5" />
                      Remove admin
                    </Button>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          {/* BANNED */}
          <TabsContent value="banned" className="space-y-2 pt-4">
            {banned.length === 0 ? (
              <EmptyRow text="No banned users." />
            ) : (
              banned.map((b) => (
                <div
                  key={b.userId}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{b.username}</div>
                    <div className="text-xs text-muted-foreground">
                      Banned by {b.bannedBy?.username ?? "—"} ·{" "}
                      {new Date(b.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unbanMutation.mutate(b.userId)}
                    disabled={unbanMutation.isPending}
                  >
                    Unban
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          {/* INVITATIONS */}
          <TabsContent value="invites" className="space-y-3 pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Username to invite"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && inviteUsername.trim() && inviteMutation.mutate()}
              />
              <Button
                onClick={() => inviteMutation.mutate()}
                disabled={!inviteUsername.trim() || inviteMutation.isPending}
              >
                Send invite
              </Button>
            </div>
            {inviteMutation.isSuccess && (
              <p className="text-xs text-green-600">Invitation sent.</p>
            )}
            {inviteMutation.isError && (
              <p className="text-xs text-destructive">
                {(inviteMutation.error as Error)?.message ?? "Failed to send invite."}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Invitations let users join without searching the public catalog.
            </p>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="setting-name">Name</Label>
              <Input
                id="setting-name"
                value={currentName}
                onChange={(e) => setSettingName(e.target.value)}
                maxLength={64}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-desc">Description</Label>
              <Textarea
                id="setting-desc"
                value={currentDesc}
                onChange={(e) => setSettingDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              {room?.visibility === "DM" ? (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  DM rooms cannot change visibility.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant={currentVis === "PUBLIC" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSettingVis("PUBLIC")}
                  >
                    Public
                  </Button>
                  <Button
                    variant={currentVis === "PRIVATE" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSettingVis("PRIVATE")}
                  >
                    Private
                  </Button>
                </div>
              )}
            </div>
            <div className="flex justify-between border-t border-border pt-4">
              {isOwner && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteRoomMutation.mutate()}
                  disabled={deleteRoomMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete room
                </Button>
              )}
              {isOwner && (
                <Button
                  onClick={() => updateRoomMutation.mutate()}
                  disabled={updateRoomMutation.isPending}
                >
                  Save changes
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
