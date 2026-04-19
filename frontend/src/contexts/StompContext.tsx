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
      // Heartbeats allow faster detection of a dead connection (e.g., after network drop).
      // Server sends a heartbeat every 10s; client sends every 10s.
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
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

        // Notification side-effects
        client.subscribe("/user/queue/notifications", (frame) => {
          const event: { type: string } = JSON.parse(frame.body);
          if (event.type === "MENTION" || event.type === "DM_MESSAGE") {
            queryClient.invalidateQueries({ queryKey: ["myRooms"] });
          }
          if (event.type === "FRIEND_REQUEST" || event.type === "FRIEND_ACCEPTED") {
            queryClient.invalidateQueries({ queryKey: ["pendingRequests"] });
            queryClient.invalidateQueries({ queryKey: ["friends"] });
          }
          if (event.type === "INVITE") {
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

  // Presence — event-driven heartbeat (NFR-1).
  // Activity events throttled to 1 send / 2 s; fire immediately on first event after idle.
  // Also maintains a 30s fallback timer so the server never times out a truly active user.
  useEffect(() => {
    if (!connected) return;
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("presence") : null;
    let lastSent = 0;

    const sendActivity = () => {
      if (!clientRef.current?.connected) return;
      const now = Date.now();
      if (now - lastSent < 2000) return; // throttle to 1 per 2 s
      lastSent = now;
      clientRef.current.publish({ destination: "/app/presence.activity", body: "{}" });
      bc?.postMessage("activity"); // notify other tabs
    };

    // Listen for activity signals from other tabs — keeps this tab's lastSent fresh
    // so we don't double-send when another tab is already driving the heartbeat.
    const onBcMessage = () => { lastSent = Date.now(); };
    bc?.addEventListener("message", onBcMessage);

    // Event-driven: send on any user interaction
    document.addEventListener("pointermove", sendActivity, { passive: true });
    document.addEventListener("keydown", sendActivity, { passive: true });
    document.addEventListener("click", sendActivity, { passive: true });

    // Fallback timer: ensures heartbeat fires at least every 25 s even if user is active
    // but events are throttled (edge case where user sits still after throttle window)
    const timer = setInterval(sendActivity, 25_000);

    return () => {
      document.removeEventListener("pointermove", sendActivity);
      document.removeEventListener("keydown", sendActivity);
      document.removeEventListener("click", sendActivity);
      clearInterval(timer);
      bc?.removeEventListener("message", onBcMessage);
      bc?.close();
    };
  }, [connected]);

  // AFK/active on visibility change (NFR-1.2 / NFR-1.3)
  useEffect(() => {
    const handler = () => {
      if (!clientRef.current?.connected) return;
      if (document.visibilityState === "hidden") {
        clientRef.current.publish({ destination: "/app/presence.afk", body: "{}" });
      } else {
        clientRef.current.publish({ destination: "/app/presence.activity", body: "{}" });
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
