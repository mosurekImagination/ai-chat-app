import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { CreateRoomModal } from "@/components/modals/CreateRoomModal";
import { SendFriendRequestModal } from "@/components/modals/SendFriendRequestModal";
import { SessionsModal } from "@/components/modals/SessionsModal";
import { AccountSettingsModal } from "@/components/modals/AccountSettingsModal";
import { ManageRoomModal } from "@/components/modals/ManageRoomModal";
import { useParams } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/rooms")({
  component: RoomsLayout,
});

function RoomsLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate]);

  const [createOpen, setCreateOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const params = useParams({ strict: false });
  const activeRoomId = (params as { id?: string }).id ? Number((params as { id?: string }).id) : null;

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Topbar
        onOpenSessions={() => setSessionsOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
        onOpenFriendRequest={() => setFriendOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col bg-chat">
          <Outlet />
        </main>
        <RightSidebar
          onCreateRoom={() => setCreateOpen(true)}
          onAddFriend={() => setFriendOpen(true)}
          onManageRoom={() => setManageOpen(true)}
        />
      </div>

      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
      <SendFriendRequestModal open={friendOpen} onOpenChange={setFriendOpen} />
      <SessionsModal open={sessionsOpen} onOpenChange={setSessionsOpen} />
      <AccountSettingsModal open={accountOpen} onOpenChange={setAccountOpen} />
      <ManageRoomModal
        open={manageOpen}
        onOpenChange={setManageOpen}
        roomId={activeRoomId}
      />
    </div>
  );
}
