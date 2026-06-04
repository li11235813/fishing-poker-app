import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMove, createLobbyRoom, roomCode, startRoomGame } from './src/game';
import type { MoveChoice, RoomState } from './src/types';

const app = express();
const rooms = new Map<string, RoomState>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

app.use(express.json());

function sanitizeName(name: unknown, fallback: string): string {
  if (typeof name !== 'string') return fallback;
  const value = name.trim().slice(0, 20);
  return value || fallback;
}

function getRoomOrThrow(roomCodeValue: string): RoomState {
  const room = rooms.get(roomCodeValue);
  if (!room) {
    throw new Error('房间不存在');
  }
  return room;
}

function nextRoomCode(): string {
  let code = roomCode();
  while (rooms.has(code)) {
    code = roomCode();
  }
  return code;
}

function touchRoom(room: RoomState): RoomState {
  const next = { ...room, updatedAt: Date.now() };
  rooms.set(room.roomCode, next);
  return next;
}

app.post('/api/rooms', (req, res) => {
  const code = nextRoomCode();
  const name = sanitizeName(req.body?.name, '房主');
  const room = createLobbyRoom(code, name);
  rooms.set(code, room);
  res.json({ room, playerId: 'p1' });
});

app.get('/api/rooms/:roomCode', (req, res) => {
  try {
    const room = getRoomOrThrow(req.params.roomCode);
    res.json({ room });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : '房间不存在' });
  }
});

app.post('/api/rooms/:roomCode/join', (req, res) => {
  try {
    const room = getRoomOrThrow(req.params.roomCode);
    if (room.players.length >= 2) {
      res.status(400).json({ error: '房间已满' });
      return;
    }

    const name = sanitizeName(req.body?.name, '玩家2');
    const nextRoom: RoomState = touchRoom({
      ...room,
      players: [...room.players, { id: 'p2', name, seat: 1 }],
    });

    res.json({ room: nextRoom, playerId: 'p2' });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : '加入失败' });
  }
});

app.post('/api/rooms/:roomCode/start', (req, res) => {
  try {
    const room = getRoomOrThrow(req.params.roomCode);
    if (req.body?.playerId !== 'p1') {
      res.status(403).json({ error: '只有房主可以开始' });
      return;
    }

    const started = touchRoom(startRoomGame(room));
    res.json({ room: started });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '开始失败' });
  }
});

app.post('/api/rooms/:roomCode/move', (req, res) => {
  try {
    const room = getRoomOrThrow(req.params.roomCode);
    if (!room.game) {
      res.status(400).json({ error: '游戏尚未开始' });
      return;
    }

    const playerId = req.body?.playerId;
    const currentPlayerId = room.game.players[room.game.currentPlayerIndex]?.id;
    if (playerId !== currentPlayerId) {
      res.status(403).json({ error: '还没轮到你' });
      return;
    }

    const move = (req.body?.move ?? null) as MoveChoice | null;
    const nextGame = applyMove(room.game, move);
    const nextRoom = touchRoom({
      ...room,
      status: nextGame.status,
      game: nextGame,
    });

    res.json({ room: nextRoom });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '操作失败' });
  }
});

app.use(express.static(distDir));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT || 5174);
app.listen(port, () => {
  console.log(`Fishing Poker server listening on http://localhost:${port}`);
});
