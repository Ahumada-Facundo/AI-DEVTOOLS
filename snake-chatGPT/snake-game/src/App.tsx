import React, { useEffect, useMemo, useRef, useState } from "react";

// Single-file Snake game (no external deps). 
// Controls: Arrow keys / WASD. Pause: Space. Restart: R.

const CELL = 18; // px
const GRID_W = 24; // columns
const GRID_H = 18; // rows
const TICK_MS = 120;

type Pt = { x: number; y: number };

type Dir = "U" | "D" | "L" | "R";

function same(a: Pt, b: Pt) {
  return a.x === b.x && a.y === b.y;
}

function clampWrap(p: Pt): Pt {
  // Wrap around edges
  let x = p.x;
  let y = p.y;
  if (x < 0) x = GRID_W - 1;
  if (x >= GRID_W) x = 0;
  if (y < 0) y = GRID_H - 1;
  if (y >= GRID_H) y = 0;
  return { x, y };
}

function dirVector(d: Dir): Pt {
  switch (d) {
    case "U":
      return { x: 0, y: -1 };
    case "D":
      return { x: 0, y: 1 };
    case "L":
      return { x: -1, y: 0 };
    case "R":
      return { x: 1, y: 0 };
  }
}

function isOpposite(a: Dir, b: Dir) {
  return (
    (a === "U" && b === "D") ||
    (a === "D" && b === "U") ||
    (a === "L" && b === "R") ||
    (a === "R" && b === "L")
  );
}

function randInt(n: number) {
  return Math.floor(Math.random() * n);
}

function randomFood(occupied: Set<string>): Pt {
  // Try random picks; fall back to scan
  for (let i = 0; i < 500; i++) {
    const p = { x: randInt(GRID_W), y: randInt(GRID_H) };
    const k = `${p.x},${p.y}`;
    if (!occupied.has(k)) return p;
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const k = `${x},${y}`;
      if (!occupied.has(k)) return { x, y };
    }
  }
  return { x: 0, y: 0 }; // should never happen
}

function initialSnake(): Pt[] {
  const cx = Math.floor(GRID_W / 2);
  const cy = Math.floor(GRID_H / 2);
  return [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
}

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const dirRef = useRef<Dir>("R");
  const nextDirQueueRef = useRef<Dir[]>([]);

  const [snake, setSnake] = useState<Pt[]>(() => initialSnake());
  const [food, setFood] = useState<Pt>(() => {
    const occ = new Set(initialSnake().map((p) => `${p.x},${p.y}`));
    return randomFood(occ);
  });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    const v = localStorage.getItem("snake_best");
    return v ? Number(v) : 0;
  });
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const p of snake) s.add(`${p.x},${p.y}`);
    return s;
  }, [snake]);

  function reset() {
    const s = initialSnake();
    setSnake(s);
    setScore(0);
    setGameOver(false);
    setPaused(false);
    dirRef.current = "R";
    nextDirQueueRef.current = [];
    const occ = new Set(s.map((p) => `${p.x},${p.y}`));
    setFood(randomFood(occ));
  }

  function enqueueDir(d: Dir) {
    const q = nextDirQueueRef.current;
    const current = q.length ? q[q.length - 1] : dirRef.current;
    if (d === current) return;
    if (isOpposite(d, current)) return;
    // Keep queue short to avoid huge buffered turns
    if (q.length < 2) q.push(d);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === " " || k === "spacebar") {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      if (k === "r") {
        reset();
        return;
      }
      if (k === "arrowup" || k === "w") enqueueDir("U");
      else if (k === "arrowdown" || k === "s") enqueueDir("D");
      else if (k === "arrowleft" || k === "a") enqueueDir("L");
      else if (k === "arrowright" || k === "d") enqueueDir("R");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snake, paused, gameOver]);

  useEffect(() => {
    // Main loop via requestAnimationFrame; advances on fixed tick.
    function loop(ts: number) {
      rafRef.current = requestAnimationFrame(loop);
      if (paused || gameOver) {
        draw();
        return;
      }
      if (!lastTickRef.current) lastTickRef.current = ts;
      const elapsed = ts - lastTickRef.current;
      if (elapsed >= TICK_MS) {
        // Avoid drift
        lastTickRef.current = ts - (elapsed % TICK_MS);
        step();
      }
      draw();
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, gameOver, snake, food]);

  useEffect(() => {
    localStorage.setItem("snake_best", String(best));
  }, [best]);

  function step() {
    setSnake((prev) => {
      // Apply queued direction
      const q = nextDirQueueRef.current;
      if (q.length) dirRef.current = q.shift()!;

      const head = prev[0];
      const v = dirVector(dirRef.current);
      const newHead = clampWrap({ x: head.x + v.x, y: head.y + v.y });

      const willEat = same(newHead, food);
      const next = [newHead, ...prev];

      // If not eating, remove tail
      if (!willEat) next.pop();

      // Collision with body (allow moving into last tail cell only if tail moved)
      const body = next.slice(1);
      for (let i = 0; i < body.length; i++) {
        if (same(body[i], newHead)) {
          setGameOver(true);
          setPaused(false);
          return prev; // freeze
        }
      }

      if (willEat) {
        setScore((s) => {
          const ns = s + 1;
          setBest((b) => Math.max(b, ns));
          return ns;
        });
        const occ = new Set(next.map((p) => `${p.x},${p.y}`));
        setFood(randomFood(occ));
      }

      return next;
    });
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = GRID_W * CELL;
    const H = GRID_H * CELL;

    // Background
    ctx.clearRect(0, 0, W, H);

    // Subtle grid
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(W, y * CELL + 0.5);
      ctx.stroke();
    }

    // Food
    ctx.fillStyle = "#ffdd57";
    ctx.beginPath();
    const fx = food.x * CELL + CELL / 2;
    const fy = food.y * CELL + CELL / 2;
    ctx.arc(fx, fy, CELL * 0.33, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const p = snake[i];
      const x = p.x * CELL;
      const y = p.y * CELL;

      const isHead = i === 0;
      ctx.fillStyle = isHead ? "#7cf29c" : "#35c36a";
      const pad = isHead ? 2 : 3;
      roundRect(ctx, x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, 6);
      ctx.fill();

      if (isHead) {
        // Eyes (simple)
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        const ex = x + CELL / 2;
        const ey = y + CELL / 2;
        const off = 4;
        const r = 2.2;
        let e1: Pt = { x: ex - off, y: ey - off };
        let e2: Pt = { x: ex + off, y: ey - off };
        const d = dirRef.current;
        if (d === "D") {
          e1 = { x: ex - off, y: ey + off };
          e2 = { x: ex + off, y: ey + off };
        } else if (d === "L") {
          e1 = { x: ex - off, y: ey - off };
          e2 = { x: ex - off, y: ey + off };
        } else if (d === "R") {
          e1 = { x: ex + off, y: ey - off };
          e2 = { x: ex + off, y: ey + off };
        }
        ctx.beginPath();
        ctx.arc(e1.x, e1.y, r, 0, Math.PI * 2);
        ctx.arc(e2.x, e2.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Overlay UI
    if (paused || gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "600 20px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(gameOver ? "Game Over" : "Paused", W / 2, H / 2 - 14);
      ctx.font = "400 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(gameOver ? "Press R to restart" : "Press Space to resume", W / 2, H / 2 + 14);
    }
  }

  const W = GRID_W * CELL;
  const H = GRID_H * CELL;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
          <div>
            <div className="text-2xl font-semibold">Snake</div>
            <div className="text-sm text-slate-300">
              Arrows/WASD to move • Space pause • R restart • Wrap-around walls
            </div>
          </div>
          <div className="flex gap-3">
            <Stat label="Score" value={score} />
            <Stat label="Best" value={best} />
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-lg border border-white/10 bg-black/20">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="block w-full h-auto"
          />
        </div>

        <div className="flex gap-2 mt-4">
          <button
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10"
            onClick={reset}
          >
            Restart
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-400">
          Tip: if you want classic walls (no wrap), replace clampWrap() with a bounds-check that triggers game over.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
