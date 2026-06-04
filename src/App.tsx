import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoom, fetchRoom, joinRoom, playMove, startGame } from './api';
import { calculateScore, findValidCaptures } from './game';
import type { Card, RoomState } from './types';
import { SUIT_LABEL } from './types';

const RULES_TEXT = `规则详解
1. 两名玩家开局各 5 张手牌，公共区域先发 1 张牌。
2. A=1，J=11，Q=12，K=13。
3. 每回合玩家最多只使用自己 1 张手牌行动。
4. 仅允许“手牌 1 张 + 公共区若干张 = 14”时收牌。
5. 收牌成功后：本回合立即结束；该玩家手牌补回到 5 张；公共区补 1 张；切换对手。
6. 若当前没有任何可钓组合，并且牌堆还有牌：不消耗手牌，直接翻开 1 张公共牌，然后切换对手。
7. 当牌堆发完后，不再补齐 5 张；玩家每回合必须手动选择 1 张手牌：能钓就收，不能钓就打到公共区，然后切换对手。
8. 计分：黑桃 4 分、梅花 3 分、红桃 2 分、方块 1 分。
9. 全部手牌打完后，按已收牌总分判定胜负。`;

const COVER_IMAGE = '/cover.jpg';
const CARD_FACE_IMAGE = '/card-face.jpg';

function cardClass(card: Card) {
  return ['hearts', 'diamonds'].includes(card.suit) ? 'card red' : 'card';
}

function CardView({ card, selected, onClick }: { card: Card; selected?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`${cardClass(card)} ${selected ? 'selected' : ''}`.trim()} onClick={onClick} style={{ backgroundImage: `linear-gradient(rgba(255, 253, 248, 0.16), rgba(246, 234, 210, 0.08)), url(${CARD_FACE_IMAGE})` }}>
      <span>{card.rank}</span>
      <span>{SUIT_LABEL[card.suit]}</span>
      <span>{card.value}</span>
    </button>
  );
}

function describeCards(cards: Card[]): string {
  return cards.map((card) => `${card.rank}${SUIT_LABEL[card.suit]}`).join(' + ');
}

type Screen = 'home' | 'lobby' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [showRules, setShowRules] = useState(false);
  const [name, setName] = useState('chad');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [selectedPublic, setSelectedPublic] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoPassTurnRef = useRef<string | null>(null);

  const game = room?.game ?? null;
  const mySeat = room?.players.find((player) => player.id === playerId)?.seat ?? 0;
  const me = game?.players[mySeat] ?? null;
  const opponent = game?.players[mySeat === 0 ? 1 : 0] ?? null;
  const currentPlayer = game ? game.players[game.currentPlayerIndex] : null;
  const isMyTurn = Boolean(game && currentPlayer?.id === playerId);
  const selectedHandCard = me?.hand.find((card) => card.id === selectedHand) ?? null;

  useEffect(() => {
    if (!room?.roomCode) return;

    const timer = window.setInterval(async () => {
      try {
        const data = await fetchRoom(room.roomCode);
        setRoom(data.room);
        if (data.room.status === 'playing') {
          setScreen('game');
        }
      } catch {
        // Ignore transient polling failures in the UI.
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [room?.roomCode]);

  useEffect(() => {
    if (room?.status !== 'playing') {
      autoPassTurnRef.current = null;
    }
  }, [room?.status]);


  const hasAnyCapture = useMemo(() => {
    if (!me || !game) return false;
    return me.hand.some((card) => findValidCaptures(card, game.publicCards).length > 0);
  }, [me, game]);

  const validSets = useMemo(() => {
    if (!selectedHandCard || !game) return [];
    return findValidCaptures(selectedHandCard, game.publicCards);
  }, [selectedHandCard, game]);

  const bestCaptureSet = useMemo(() => {
    if (!selectedHandCard || validSets.length === 0) return null;

    return validSets.reduce((best, current) => {
      const bestScore = calculateScore([selectedHandCard, ...best]);
      const currentScore = calculateScore([selectedHandCard, ...current]);
      if (currentScore !== bestScore) {
        return currentScore > bestScore ? current : best;
      }
      return current.length > best.length ? current : best;
    });
  }, [selectedHandCard, validSets]);

  const captureOptions = useMemo(() => {
    if (!selectedHandCard || validSets.length === 0) return [];

    return validSets
      .map((setCards) => ({
        cards: setCards,
        score: calculateScore([selectedHandCard, ...setCards]),
      }))
      .sort((a, b) => b.score - a.score || b.cards.length - a.cards.length);
  }, [selectedHandCard, validSets]);

  const selectionTotal = useMemo(() => {

    if (!selectedHandCard || !game) return 0;
    return selectedHandCard.value + game.publicCards.filter((card) => selectedPublic.includes(card.id)).reduce((sum, card) => sum + card.value, 0);
  }, [selectedHandCard, selectedPublic, game]);

  useEffect(() => {
    if (!selectedHandCard) {
      setHint(null);
      return;
    }

    if (!bestCaptureSet) {
      setSelectedPublic([]);
      if ((game?.deck.length ?? 0) === 0) {
        setHint(`这张牌当前无法与公共区域凑成 14：${selectedHandCard.rank}${SUIT_LABEL[selectedHandCard.suit]}。牌堆已空，请手动打出这张牌。`);
      } else {
        setHint(`这张牌当前无法与公共区域凑成 14：${selectedHandCard.rank}${SUIT_LABEL[selectedHandCard.suit]}`);
      }
      return;
    }

    const bestIds = bestCaptureSet.map((card) => card.id);
    setSelectedPublic(bestIds);

    const bestScore = calculateScore([selectedHandCard, ...bestCaptureSet]);
    const details = captureOptions
      .map((option, index) => `方案${index + 1}：${describeCards([selectedHandCard, ...option.cards])} = 14，得分 ${option.score}`)
      .join('；');

    setHint(`推荐方案得分最高：${bestScore}。${details}`);
  }, [selectedHandCard, bestCaptureSet, captureOptions]);


  useEffect(() => {
    if (!game || !room || !playerId || !isMyTurn || hasAnyCapture || game.deck.length === 0) {
      autoPassTurnRef.current = null;
      return;
    }

    const turnKey = `${room.roomCode}-${game.log.length}-${currentPlayer?.id}`;
    if (autoPassTurnRef.current === turnKey) return;
    autoPassTurnRef.current = turnKey;

    setHint('当前手牌都无法与公共区域凑成 14，系统将自动翻开 1 张公共牌并切换玩家。');
    const timer = window.setTimeout(() => {
      void drawPublicCard(true);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [currentPlayer?.id, game, hasAnyCapture, isMyTurn, playerId, room]);


  async function handleCreateRoom() {
    setBusy(true);
    setError(null);
    try {
      const data = await createRoom(name || '房主');
      setRoom(data.room);
      setPlayerId(data.playerId);
      setScreen('lobby');
      setSelectedHand(null);
      setSelectedPublic([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinRoom() {
    const code = joinCode.trim();
    if (!/^\d{4}$/.test(code)) {
      setError('请输入 4 位数字房间码');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await joinRoom(code, name || '玩家2');
      setRoom(data.room);
      setPlayerId(data.playerId);
      setScreen(data.room.status === 'playing' ? 'game' : 'lobby');
      setSelectedHand(null);
      setSelectedPublic([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加入失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartGame() {
    if (!room || !playerId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await startGame(room.roomCode, playerId);
      setRoom(data.room);
      setScreen('game');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '开始失败');
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setRoom(null);
    setPlayerId(null);
    setScreen('home');
    setSelectedHand(null);
    setSelectedPublic([]);
    setError(null);
  }

  function togglePublicCard(id: string) {
    if (!isMyTurn) return;
    setSelectedPublic((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function submitMove() {
    if (!room || !playerId || !selectedHand || !selectedHandCard) return;
    const chosenCards = game?.publicCards.filter((card) => selectedPublic.includes(card.id)) ?? [];
    const total = selectedHandCard.value + chosenCards.reduce((sum, card) => sum + card.value, 0);

    if (chosenCards.length === 0 || total !== 14) {
      setError('只有凑成 14 时才能出手牌；如果当前无可钓组合，请点“翻开公共牌”');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await playMove(room.roomCode, playerId, { handCardId: selectedHand, publicCardIds: selectedPublic });
      setRoom(data.room);
      setSelectedHand(null);
      setSelectedPublic([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '出牌失败');
    } finally {
      setBusy(false);
    }
  }

  async function drawPublicCard(isAutomatic = false) {
    if (!room || !playerId) return;
    setBusy(true);
    if (!isAutomatic) {
      setError(null);
    }
    try {
      const data = await playMove(room.roomCode, playerId, null);
      setRoom(data.room);
      setSelectedHand(null);
      setSelectedPublic([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '翻牌失败');
    } finally {
      setBusy(false);
    }
  }

  async function discardHandCard() {
    if (!room || !playerId || !selectedHand || !selectedHandCard || (game?.deck.length ?? 0) > 0) return;
    setBusy(true);
    setError(null);
    try {
      const data = await playMove(room.roomCode, playerId, { handCardId: selectedHand, publicCardIds: [] });
      setRoom(data.room);
      setSelectedHand(null);
      setSelectedPublic([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '打牌失败');
    } finally {
      setBusy(false);
    }
  }

  if (screen === 'home') {
    return (
      <div className="app home-app cover-app" style={{ backgroundImage: `linear-gradient(rgba(12, 10, 8, 0.6), rgba(12, 10, 8, 0.78)), url(${COVER_IMAGE})` }}>
        <div className="home-shell panel">
          <div className="hero-badge">真联机版房间入口</div>
          <h1 className="title hero-title">生成房间码，发给对手加入</h1>
          <p className="muted hero-text">现在这个版本已经接上房间服务。两个人分别打开网页，一个创建房间，一个输入 4 位码加入，然后由房主点击开始。</p>

          <div className="home-grid">
            <div className="panel subpanel">
              <h2>创建房间</h2>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
              <button onClick={handleCreateRoom} disabled={busy}>生成房间</button>
            </div>

            <div className="panel subpanel">
              <h2>加入房间</h2>
              <input value={joinCode} maxLength={4} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))} placeholder="输入四位数随机码" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
              <button className="secondary" onClick={handleJoinRoom} disabled={busy}>加入房间</button>
            </div>
          </div>

          <div className="home-actions">
            <button className="ghost" onClick={() => setShowRules((v) => !v)}>{showRules ? '收起规则详解' : '查看规则详解'}</button>
          </div>

          {error && <p className="error-text">{error}</p>}

          {showRules && (
            <div className="panel rules-panel">
              <div className="rules">{RULES_TEXT}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'lobby') {
    const isHost = playerId === 'p1';
    return (
      <div className="app home-app">
        <div className="home-shell panel">
          <div className="hero-badge">房间已准备</div>
          <h1 className="title hero-title">房间码：{room?.roomCode}</h1>
          <p className="muted hero-text">把这 4 位码发给对手。双方进入后，房主点击开始按钮就会进入对局。</p>

          <div className="lobby-cards">
            <div className="panel subpanel">
              <h2>房间信息</h2>
              <p>房主：{room?.players.find((player) => player.id === 'p1')?.name ?? '等待中'}</p>
              <p>对手：{room?.players.find((player) => player.id === 'p2')?.name ?? '等待加入'}</p>
              <p>当前人数：{room?.players.length ?? 0} / 2</p>
              <p>你的身份：{isHost ? '房主' : '加入者'}</p>
            </div>

            <div className="panel subpanel">
              <h2>操作</h2>
              <button onClick={handleStartGame} disabled={!isHost || room?.players.length !== 2 || busy}>开始按钮</button>
              <button className="secondary" onClick={resetAll}>返回首页</button>
              <button className="ghost" onClick={() => setShowRules((v) => !v)}>{showRules ? '收起规则详解' : '规则详解'}</button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          {showRules && (
            <div className="panel rules-panel">
              <div className="rules">{RULES_TEXT}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app board-app" style={{ backgroundImage: `linear-gradient(rgba(12, 10, 8, 0.68), rgba(12, 10, 8, 0.82)), url(${COVER_IMAGE})` }}>
      <div className="shell">
        <aside className="panel">
          <h1 className="title">钓鱼扑克</h1>
          <p className="muted">真实房间对局。两边浏览器会按房间号同步。</p>

          <div>
            <p><span className="badge">房间号 {room?.roomCode}</span></p>
            <p>你的身份：{playerId === 'p1' ? '房主' : '加入者'}</p>
            <p>牌堆剩余：{game?.deck.length ?? 0}</p>
            <p>当前回合：{currentPlayer?.name ?? '-'}</p>
            <p>{me?.name} 得分：{calculateScore(me?.captured ?? [])}</p>
            <p>{opponent?.name} 得分：{calculateScore(opponent?.captured ?? [])}</p>
            {game?.status === 'finished' && <p className="badge">{game.winnerId === 'draw' ? '平局' : `胜者：${game.players.find((p) => p.id === game.winnerId)?.name}`}</p>}
            <p className="muted">{isMyTurn ? '轮到你操作' : '等待对手操作'}</p>
          </div>

          <div>
            <button className="secondary" onClick={resetAll}>返回首页</button>
            <button className="ghost" onClick={() => setShowRules((v) => !v)}>{showRules ? '收起规则' : '规则详解'}</button>
          </div>

          {error && <p className="error-text">{error}</p>}

          {showRules && (
            <div className="panel" style={{ marginTop: 16, padding: 12 }}>
              <div className="rules">{RULES_TEXT}</div>
            </div>
          )}
        </aside>

        <main className="board">
          <section className="panel">
            <h2>公共区域</h2>
            <div className="row">
              {game?.publicCards.map((card) => (
                <CardView key={card.id} card={card} selected={selectedPublic.includes(card.id)} onClick={() => togglePublicCard(card.id)} />
              ))}
            </div>
            <p className="muted">当前选择总和：{selectionTotal} / 14</p>
            {selectedHandCard && <p className="muted">可行组合数：{validSets.length}</p>}
            {selectedHandCard && hint && <p className="muted">{hint}</p>}
          </section>

          <section className="panel">
            <h2>{me?.name ?? '你的'}手牌</h2>
            <div className="row">
              {me?.hand.map((card) => (
                <CardView key={card.id} card={card} selected={selectedHand === card.id} onClick={() => isMyTurn && setSelectedHand(card.id)} />
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={submitMove} disabled={!selectedHand || !isMyTurn || busy}>收牌（凑 14）</button>
              <button className="secondary" onClick={() => { void drawPublicCard(); }} disabled={!isMyTurn || busy || hasAnyCapture || (game?.deck.length ?? 0) === 0}>翻开公共牌</button>
              <button className="secondary" onClick={() => { void discardHandCard(); }} disabled={!selectedHand || !isMyTurn || busy || (game?.deck.length ?? 0) > 0}>打出这张牌</button>
              <button className="ghost" onClick={() => { setSelectedHand(null); setSelectedPublic([]); }} disabled={busy}>清空选择</button>
            </div>
            {!hasAnyCapture && (game?.deck.length ?? 0) > 0 && <p className="muted">当前没有可钓组合，可直接点“翻开公共牌”。</p>}
            {!hasAnyCapture && (game?.deck.length ?? 0) === 0 && <p className="muted">牌堆已空，当前无可钓组合时请手动打出一张手牌。</p>}
          </section>

          <section className="panel">
            <h2>{opponent?.name ?? '对手'}信息</h2>
            <p>手牌数：{opponent?.hand.length ?? 0}</p>
            <p>已收牌数：{opponent?.captured.length ?? 0}</p>
          </section>

          <section className="panel">
            <h2>操作日志</h2>
            <ol className="log">
              {game?.log.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ol>
          </section>
        </main>
      </div>
    </div>
  );
}
