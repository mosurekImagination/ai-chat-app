import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import type { IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "./AuthContext";

interface StompContextValue {
  subscribe: (dest: string, handler: (frame: IMessage) => void) => () => void;
  send: (dest: string, body: object) => void;
  connected: boolean;
}

const StompContext = createContext<StompContextValue>({
  subscribe: () => () => {},
  send: () => {},
  connected: false,
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
  const clientRef = useRef<Client | null>(null);
  const registryRef = useRef<Map<string, RegistryEntry>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      clientRef.current?.deactivate();
      clientRef.current = null;
      setConnected(false);
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
  }, [user]);

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

  return (
    <StompContext.Provider value={{ subscribe, send, connected }}>
      {children}
    </StompContext.Provider>
  );
}
