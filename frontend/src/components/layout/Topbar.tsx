import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Compass, Settings, LogOut, UserCircle2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

interface TopbarProps {
  onOpenSessions: () => void;
  onOpenAccount: () => void;
  onOpenFriendRequest: () => void;
  pendingFriendRequests?: number;
}

export function Topbar({ onOpenSessions, onOpenAccount, onOpenFriendRequest, pendingFriendRequests = 0 }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-topbar px-4">
      <div className="flex items-center gap-6">
        <Link to="/rooms" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
            R
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">Relay</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/rooms/catalog"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "bg-accent text-foreground" }}
          >
            <Compass className="h-4 w-4" />
            Public Rooms
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={onOpenFriendRequest}
          aria-label="Friend requests"
        >
          <Users className="h-5 w-5" />
          {pendingFriendRequests > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive p-0 text-[10px]">
              {pendingFriendRequests}
            </Badge>
          )}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {user?.username.slice(0, 1).toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{user?.username ?? ""}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenAccount} aria-label="Account settings">
              <UserCircle2 className="mr-2 h-4 w-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenSessions} aria-label="Sessions">
              <Settings className="mr-2 h-4 w-4" />
              Active sessions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
