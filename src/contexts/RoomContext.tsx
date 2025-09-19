"use client";

import * as React from "react";

type User = { nick: string; ready: boolean };

export type RoomContextType = {
  roomId: string;
  nick: string;
  connected: boolean;
  messages: {
    type: "system" | "chat";
    text?: string;
    nick?: string;
    at: number;
  }[];
  users: User[];
  gameStarted: boolean;
  countdown: number | null;
  scores: Record<string, Record<string, number | null>>;
  turnIndex: number;
};

const RoomContext = React.createContext<RoomContextType | null>(null);

export function RoomProvider({
  value,
  children,
}: {
  value: RoomContextType;
  children: React.ReactNode;
}) {
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const ctx = React.useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within a RoomProvider");
  return ctx;
}
