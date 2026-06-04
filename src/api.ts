import type { MoveChoice, RoomState } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? '请求失败');
  }

  return response.json() as Promise<T>;
}

export function createRoom(name: string): Promise<{ room: RoomState; playerId: string }> {
  return request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function joinRoom(roomCode: string, name: string): Promise<{ room: RoomState; playerId: string }> {
  return request(`/api/rooms/${roomCode}/join`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function startGame(roomCode: string, playerId: string): Promise<{ room: RoomState }> {
  return request(`/api/rooms/${roomCode}/start`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function fetchRoom(roomCode: string): Promise<{ room: RoomState }> {
  return request(`/api/rooms/${roomCode}`);
}

export function playMove(roomCode: string, playerId: string, move: MoveChoice | null): Promise<{ room: RoomState }> {
  return request(`/api/rooms/${roomCode}/move`, {
    method: 'POST',
    body: JSON.stringify({ playerId, move }),
  });
}
