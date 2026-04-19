import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import type { IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import type { Presence } from "@/lib/types";

interface StompContextValue {
  subscribe: (dest: string, handler: (frame: IMessage) => void) => () => void;
  send: (dest: string, body: object) => void;
  connected: boolean;
  getPresence: (userId: number) => Presence;
  seedPresence: (userId: number, status: string) => void;
}

const StompContext = createContext<StompContextValue>({
  subscribe: () => () => {},
  send: () => {},
  connected: false,
  getPresence: () => "OFFLINE",
  seedPresence: () => {},
});

export function useStormp() {
  return useContext(StompContext);
}

type RegistryEntry = {
  dest: string;
  handler: (frame: IMessage) => void;
  sub: StompSubscription | null;
};

export function StompProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const clientRef = useRef<Client | null>(null);
  const registryRef = useRef<Map<string, RegistryEntry>>(new Map());
  const [connected, setConnected] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!user) {
      clientRef.current?.deactivate();
      clientRef.current = null;
      setConnected(false);
      setPresenceMap({});
      return;
    }

    const client = new Client({
      webSocketFactory: () => new SockJS("/ws"),
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);

        // Re-subscribe all registered handlers on every connect/reconnect
        registryRef.current.forEach((entry) => {
          entry.sub = client.subscribe(entry.dest, entry.handler);
        });

        // Presence updates (friend-scoped)
        client.subscribe("/user/queue/presence", (frame) => {
          const event: { userId: number; status: string } = JSON.parse(frame.body);
          setPresenceMap((prev) => ({ ...prev, [event.userId]: event.status }));
        });

        // Notification side-effects: refresh unread counts on message notifications
        client.subscribe("/user/queue/notifications", (frame) => {
          const event: { type: string } = JSON.parse(frame.body);
          if (event.type === "MENTION" || event.type === "DM_MESSAGE") {
            queryClient.invalidateQueries({ queryKey: ["myRooms"] });
          }
        });
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    });

    clientRef.current = client;
    client.activate();

    return () => {
      client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [user, queryClient]);

  // Presence heartbeat every 30 s
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      clientRef.current?.publish({ destination: "/app/presence.activity", body: "{}" });
    }, 30_000);
    return () => clearInterval(timer);
  }, [connected]);

  // AFK when tab becomes hidden
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden" && clientRef.current?.connected) {
        clientRef.current.publish({ destination: "/app/presence.afk", body: "{}" });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const subscribe = (dest: string, handler: (frame: IMessage) => void): (() => void) => {
    const id = `${dest}-${Math.random().toString(36).slice(2)}`;
    const entry: RegistryEntry = { dest, handler, sub: null };

    if (clientRef.current?.connected) {
      entry.sub = clientRef.current.subscribe(dest, handler);
    }
    registryRef.current.set(id, entry);

    return () => {
      entry.sub?.unsubscribe();
      registryRef.current.delete(id);
    };
  };

  const send = (dest: string, body: object) => {
    if (!clientRef.current?.connected) return;
    clientRef.current.publish({ destination: dest, body: JSON.stringify(body) });
  };

  const getPresence = (userId: number): Presence =>
    (presenceMap[userId] as Presence) ?? "OFFLINE";

  // Seed initial presence from API response (overwritten by STOMP events when they arrive)
  const seedPresence = (userId: number, status: string) => {
    setPresenceMap((prev) => (prev[userId] !== undefined ? prev : { ...prev, [userId]: status }));
  };

  return (
    <StompContext.Provider value={{ subscribe, send, connected, getPresence, seedPresence }}>
      {children}
    </StompContext.Provider>
  );
}
