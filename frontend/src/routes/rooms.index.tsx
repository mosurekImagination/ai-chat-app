import { createFileRoute, Link } from "@tanstack/react-router";
import { MessagesSquare, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/rooms/")({
  component: RoomsIndex,
});

function RoomsIndex() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <MessagesSquare className="h-10 w-10" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        Select a room to start chatting
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Pick a room from the right sidebar, or browse the public catalog to discover new
        communities.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link to="/rooms/catalog">
            <Compass className="mr-2 h-4 w-4" />
            Browse public rooms
          </Link>
        </Button>
      </div>
    </div>
  );
}
