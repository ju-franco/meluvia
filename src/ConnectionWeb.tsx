import { useEffect, useMemo, useRef, useState } from "react";

export type GraphNode = {
  id: string;
  name: string;
  type: "artist" | "track";
  image?: string;
  match: number;
  ring: 0 | 1 | 2;
  x: number;
  y: number;
  url?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
  reason: string;
};

export type GraphData = {
  width: number;
  height: number;
  center: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type Props = {
  centerArtist: string;
  seedTrack?: string;
  onRecenter: (artist: string) => void;
  onOpenArtist: (artist: string) => void;
};

export default function ConnectionWeb({
  centerArtist,
  seedTrack,
  onRecenter,
  onOpenArtist,
}: Props) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeEdge, setActiveEdge] = useState<GraphEdge | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);

  const historyRef = useRef<string[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ artist: centerArtist });
    if (seedTrack) params.set("track", seedTrack);

    setLoading(true);
    setError("");
    setData(null);

    fetch(`/api/graph?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Falha no mapa.");
        if (!cancelled) {
          setData(json);
          setScale(1);
          setOffset({ x: 0, y: 0 });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro no mapa.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [centerArtist, seedTrack]);

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    data?.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [data]);

  function goToArtist(artist: string) {
    historyRef.current.push(centerArtist);
    setHistoryLen(historyRef.current.length);
    onRecenter(artist);
  }

  function backToOriginal() {
    const first = historyRef.current[0];
    if (first) {
      historyRef.current = [];
      setHistoryLen(0);
      onRecenter(first);
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.min(2.5, Math.max(0.5, scale - e.deltaY * 0.001));
    setScale(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div className="web-wrap">
      <div className="web-header">
        <p className="eyebrow">MAPA DE CONEXÕES</p>
        <h3>Como <span>{centerArtist}</span> se conecta</h3>
        <p className="web-hint">
          Linhas = similaridade informada pela Last.fm. Espessura maior
          significa relação mais forte nos dados.
        </p>
      </div>

      {loading && <p className="status">Tecendo a teia...</p>}
      {error && <p className="status error">{error}</p>}

      {data && !loading && (
        <>
          <div className="web-controls">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            >
              +
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            >
              −
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
              }}
            >
              Centralizar
            </button>
            {historyLen > 0 && (
              <button
                type="button"
                className="btn-primary"
                onClick={backToOriginal}
              >
                ← Voltar ao artista original
              </button>
            )}
          </div>

          <svg
            className="web-svg"
            viewBox={`0 0 ${data.width} ${data.height}`}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            role="img"
            aria-label={`Mapa de conexões de ${centerArtist}`}
          >
            <g
              transform={`translate(${offset.x} ${offset.y}) translate(${data.width / 2} ${data.height / 2}) scale(${scale}) translate(${-data.width / 2} ${-data.height / 2})`}
            >
              {data.edges.map((e, i) => {
                const a = nodeById.get(e.source);
                const b = nodeById.get(e.target);
                if (!a || !b) return null;
                const w = Math.max(0.6, Math.min(3, e.weight * 3));
                const isActive =
                  activeEdge &&
                  ((activeEdge.source === e.source && activeEdge.target === e.target) ||
                    (activeEdge.source === e.target && activeEdge.target === e.source));
                return (
                  <line
                    key={`edge-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={isActive ? "var(--primary-dark)" : "#d8d4cd"}
                    strokeWidth={isActive ? 2.5 : w}
                    opacity={isActive ? 1 : 0.7}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActiveEdge(e)}
                  />
                );
              })}

              {data.nodes.map((n) => {
                const isCenter = n.id === data.center;
                const r = isCenter ? 26 : 16;
                const hover = hoverNode?.id === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x} ${n.y})`}
                    style={{ cursor: "pointer" }}
                    onClick={() => !isCenter && goToArtist(n.name)}
                    onMouseEnter={() => setHoverNode(n)}
                    onMouseLeave={() => setHoverNode(null)}
                    onDoubleClick={() => onOpenArtist(n.name)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.name} — clique para recentralizar`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isCenter) goToArtist(n.name);
                    }}
                  >
                    {n.image ? (
                      <>
                        <defs>
                          <clipPath id={`clip-${n.id}`}>
                            <circle r={r} />
                          </clipPath>
                        </defs>
                        <image
                          href={n.image}
                          x={-r}
                          y={-r}
                          width={r * 2}
                          height={r * 2}
                          clipPath={`url(#clip-${n.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                        <circle
                          r={r}
                          fill="none"
                          stroke={isCenter ? "var(--primary)" : "#fff"}
                          strokeWidth={isCenter ? 3 : 2}
                        />
                      </>
                    ) : (
                      <circle
                        r={r}
                        fill={isCenter ? "var(--primary)" : "#fff"}
                        stroke={isCenter ? "var(--primary-dark)" : "var(--primary)"}
                        strokeWidth={2}
                      />
                    )}
                    {isCenter && (
                      <circle r={r + 6} fill="none" stroke="var(--primary)" strokeOpacity={0.35} />
                    )}
                    <text
                      y={r + 14}
                      textAnchor="middle"
                      fontSize={isCenter ? 12 : 11}
                      fontWeight={isCenter ? 700 : 500}
                      fill={hover ? "var(--primary-dark)" : "#333"}
                      style={{ pointerEvents: "none" }}
                    >
                      {n.name.length > 22 ? n.name.slice(0, 20) + "…" : n.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {activeEdge && (
            <div className="web-edge-info" aria-live="polite">
              <p>
                <strong>
                  {nodeById.get(activeEdge.source)?.name} ↔{" "}
                  {nodeById.get(activeEdge.target)?.name}
                </strong>
              </p>
              <p>{activeEdge.reason}</p>
              <button
                type="button"
                className="radar-details-close"
                onClick={() => setActiveEdge(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          )}

          <div className="web-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onOpenArtist(centerArtist)}
            >
              Ver músicas de {centerArtist}
            </button>
          </div>
        </>
      )}
    </div>
  );
}