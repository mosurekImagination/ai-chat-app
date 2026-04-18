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
import { Trash2, Shield, Ban, ShieldOff } from "lucide-react";
import { roomMembers, rooms, bans } from "@/lib/mockData";

interface ManageRoomModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: number | null;
}

export function ManageRoomModal({ open, onOpenChange, roomId }: ManageRoomModalProps) {
  const room = roomId ? rooms.find((r) => r.id === roomId) : null;
  const members = roomId ? (roomMembers[roomId] ?? []) : [];
  const banned = roomId ? (bans[roomId] ?? []) : [];
  const admins = members.filter((m) => m.role === "ADMIN");
  const [search, setSearch] = useState("");

  const filteredMembers = members.filter((m) =>
    m.username.toLowerCase().includes(search.toLowerCase()),
  );

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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                        {m.role === "MEMBER" ? (
                          <Button size="sm" variant="outline">
                            <Shield className="mr-1 h-3.5 w-3.5" />
                            Make admin
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline">
                            <ShieldOff className="mr-1 h-3.5 w-3.5" />
                            Remove admin
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive">
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
                      <span className="text-xs text-muted-foreground">(owner)</span>
                    )}
                  </div>
                  {room?.ownerId !== a.userId && (
                    <Button size="sm" variant="outline">
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
                  <Button size="sm" variant="outline">
                    Unban
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          {/* INVITATIONS */}
          <TabsContent value="invites" className="space-y-3 pt-4">
            <div className="flex gap-2">
              <Input placeholder="Username to invite" />
              <Button>Send invite</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Invitations let users join without searching the public catalog.
            </p>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="setting-name">Name</Label>
              <Input id="setting-name" defaultValue={room?.name ?? ""} maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-desc">Description</Label>
              <Textarea id="setting-desc" defaultValue={room?.description ?? ""} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              {room?.visibility === "DM" ? (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  DM rooms cannot change visibility.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant={room?.visibility === "PUBLIC" ? "default" : "outline"} size="sm">
                    Public
                  </Button>
                  <Button variant={room?.visibility === "PRIVATE" ? "default" : "outline"} size="sm">
                    Private
                  </Button>
                </div>
              )}
            </div>
            <div className="flex justify-between border-t border-border pt-4">
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete room
              </Button>
              <Button>Save changes</Button>
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
