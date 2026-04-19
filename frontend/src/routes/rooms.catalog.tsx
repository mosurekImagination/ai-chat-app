import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, Hash, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { rooms, roomMembers, currentUser } from "@/lib/mockData";

export const Route = createFileRoute("/rooms/catalog")({
  component: CatalogPage,
});

function CatalogPage() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const publicRooms = useMemo(
    () =>
      rooms
        .filter((r) => r.visibility === "PUBLIC")
        .filter((r) => (r.name ?? "").toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Public rooms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse open communities and join the conversation.
          </p>
        </header>

        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search rooms by name…"
            className="pl-9"
          />
        </div>

        {publicRooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">No public rooms found.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {publicRooms.map((r) => {
              const members = roomMembers[r.id] ?? [];
              const joined = members.some((m) => m.userId === currentUser.userId);
              return (
                <div
                  key={r.id}
                  className="flex flex-col rounded-lg border border-border bg-card p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Hash className="h-4 w-4" />
                    </div>
                    <span className="text-base font-semibold text-foreground">{r.name}</span>
                  </div>
                  <p className="mb-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
                    {r.description ?? "No description."}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {r.memberCount} members
                    </span>
                    <Button
                      size="sm"
                      variant={joined ? "outline" : "default"}
                      onClick={() => navigate({ to: "/rooms/$id", params: { id: String(r.id) } })}
                    >
                      {joined ? "Open" : "Join"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
