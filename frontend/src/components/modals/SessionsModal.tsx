import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authService } from "@/lib/services/authService";

interface SessionsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SessionsModal({ open, onOpenChange }: SessionsModalProps) {
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: authService.getSessions,
    enabled: open,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => authService.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Active sessions</DialogTitle>
          <DialogDescription>
            Devices that are signed in to your account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.browserInfo ?? "Unknown browser"}</span>
                  {s.current && (
                    <Badge className="bg-success/20 text-success border-success/40" variant="outline">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.ip} · since {new Date(s.createdAt).toLocaleDateString()}
                </div>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revokeMutation.mutate(s.id)}
                  disabled={revokeMutation.isPending}
                  aria-label={`Revoke session ${s.id}`}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
