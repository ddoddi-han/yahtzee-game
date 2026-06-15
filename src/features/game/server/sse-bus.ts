import { ServerMessage } from '../shared/messages';

const encoder = new TextEncoder();

export type Connection = {
  id: string;
  nick: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

type GlobalConnections = {
  __yahtzeeConnections__?: Map<string, Map<string, Connection>>;
};

const globalConnections = globalThis as typeof globalThis & GlobalConnections;

if (!globalConnections.__yahtzeeConnections__) {
  globalConnections.__yahtzeeConnections__ = new Map<string, Map<string, Connection>>();
}

export const connections = globalConnections.__yahtzeeConnections__;

export function addConnection(roomId: string, connection: Connection) {
  const roomConnections = connections.get(roomId) ?? new Map<string, Connection>();
  const previous = roomConnections.get(connection.nick);

  if (previous) {
    sendToConnection(previous, {
      type: 'force-exit',
      reason: '다른 탭에서 접속하여 연결이 종료되었습니다.',
    });
    try {
      previous.controller.close();
    } catch {}
  }

  roomConnections.set(connection.nick, connection);
  connections.set(roomId, roomConnections);
}

export function getConnection(roomId: string, nick: string) {
  return connections.get(roomId)?.get(nick) ?? null;
}

export function removeConnection(roomId: string, nick: string, connectionId: string) {
  const roomConnections = connections.get(roomId);
  const connection = roomConnections?.get(nick);
  if (!roomConnections || connection?.id !== connectionId) return false;

  roomConnections.delete(nick);
  if (roomConnections.size === 0) connections.delete(roomId);
  return true;
}

export function sendToConnection(connection: Connection, message: ServerMessage) {
  connection.controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
}

export function broadcast(roomId: string, message: ServerMessage) {
  const roomConnections = connections.get(roomId);
  if (!roomConnections) return;

  for (const connection of roomConnections.values()) {
    try {
      sendToConnection(connection, message);
    } catch {
      roomConnections.delete(connection.nick);
    }
  }
}
