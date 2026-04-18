import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      gap={8}
      visibleToasts={3}
      toastOptions={{
        classNames: {
          toast:
            "group toast pointer-events-auto group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-lg",
          title: "text-sm font-medium",
          description: "group-[.toast]:text-muted-foreground text-xs",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[var(--success)]",
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[var(--danger)]",
          info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[var(--info)]",
          warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[var(--afk)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
