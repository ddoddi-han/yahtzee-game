"use client";

import { TDice, TUsers } from "@/lib/roomBus";
import * as React from "react";

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
  users: TUsers;
  gameStarted: boolean;
  countdown: number | null;
  scores: Record<string, Record<string, number | null>>;
  turnIndex: number;
  dice: TDice[];
  rollsLeft: number;
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
