import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authService } from "@/lib/services/authService";
import { useAuth } from "@/contexts/AuthContext";

interface AccountSettingsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AccountSettingsModal({ open, onOpenChange }: AccountSettingsModalProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const changePwdMutation = useMutation({
    mutationFn: () => authService.changePassword(currentPwd, newPwd),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    },
    onError: (err: Error) => {
      if (err.message.includes("WRONG_CURRENT_PASSWORD")) toast.error("Current password is incorrect");
      else toast.error("Failed to update password");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => authService.deleteAccount(),
    onSuccess: async () => {
      toast.success("Account deleted");
      onOpenChange(false);
      await logout();
      navigate({ to: "/login" });
    },
    onError: () => toast.error("Failed to delete account"),
  });

  const handleUpdatePassword = () => {
    if (!currentPwd || !newPwd) { toast.error("Fill in all password fields"); return; }
    if (newPwd.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPwd !== confirmPwd) { toast.error("Passwords don't match"); return; }
    changePwdMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>Manage your password and account.</DialogDescription>
        </DialogHeader>

        <section className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold">Change password</h3>
          <div className="space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleUpdatePassword}
            disabled={changePwdMutation.isPending}
            aria-label="Update password"
          >
            Update password
          </Button>
        </section>

        <Separator className="my-4" />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
          {!confirmDelete ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete my account"
            >
              Delete my account
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <p className="text-sm">
                This cannot be undone. All your data will be permanently deleted.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => deleteAccountMutation.mutate()}
                  disabled={deleteAccountMutation.isPending}
                  aria-label="Confirm delete account"
                >
                  Yes, delete
                </Button>
              </div>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
