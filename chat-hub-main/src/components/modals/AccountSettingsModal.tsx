import { useState } from "react";
import { toast } from "sonner";
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

interface AccountSettingsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AccountSettingsModal({ open, onOpenChange }: AccountSettingsModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const handleUpdatePassword = () => {
    if (!currentPwd || !newPwd) {
      toast.error("Missing fields", { description: "Fill in both password fields." });
      return;
    }
    if (newPwd.length < 8) {
      toast.error("Password too short", { description: "Use at least 8 characters." });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Passwords don't match", {
        description: "Confirmation must match the new password.",
      });
      return;
    }
    toast.success("Password updated", { description: "Use it next time you sign in." });
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
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
          <Button className="w-full" onClick={handleUpdatePassword}>
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
                  onClick={() => {
                    toast.error("Account deleted", {
                      description: "Your account and data have been removed.",
                    });
                    setConfirmDelete(false);
                    onOpenChange(false);
                  }}
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
