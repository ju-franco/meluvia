import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addFavorite,
  addRejected,
  getFavorites,
  getRejectedKeys,
  trackKey,
} from "./storage";
import vinylTexture from "./assets/vinyl.png";

type Candidate = {
  key: string;
  title: string;
  artist: string;
  image?: string;
  appleUrl?: string;
  genre?: string;
  previewUrl?: string;
  match: number;
};

type Props = {
  seed: { track: string; artist: string };
  onClose: () => void;
  onFavoritesChanged: () => void;
};

type DeckState = "loading" | "playing" | "empty" | "error" | "summary";

export default function ListenMatch({ seed, onClose, onFavoritesChanged }: Props) {
  const [deck, setDeck] = useState<Candidate[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<DeckState>("loading");
  const [error, setError] = useState("");
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionFavs, setSessionFavs] = useState(0);
  const [drag, setDrag] = useState({ x: 0, active: false });
  const [showSummary, setShowSummary] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const current = deck[index];

  const loadDeck = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const params = new URLSearchParams({
        track: seed.track,
        artist: seed.artist,
        page: "1",
      });
      const rejected = getRejectedKeys();
      if (rejected.size > 0) {
        params.set("exclude", Array.from(rejected).join(","));
      }
      const res = await fetch(`/api/recommendations?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar.");

      const items: Candidate[] = (json.recommendations ?? []).map((r: any) => ({
        key: trackKey(r.title, r.artist),
        title: r.title,
        artist: r.artist,
        image: r.image || undefined,
        appleUrl: r.appleUrl || undefined,
        genre: r.genre || undefined,
        previewUrl: r.previewUrl || undefined,
        match: r.match,
      }));

      const filtered = items.filter((c) => !rejected.has(c.key));
      if (filtered.length === 0) {
        setDeck([]);
        setIndex(0);
        setState("empty");
        return;
      }
      setDeck(filtered);
      setIndex(0);
      setSessionCount(0);
      setSessionFavs(0);
      setShowSummary(false);
      setState("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar.");
      setState("error");
    }
  }, [seed.track, seed.artist]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  useEffect(() => {
    if (state !== "playing" || !current) return;
    const el = audioRef.current;
    if (el && current.previewUrl) {
      el.currentTime = 0;
      el.play().catch(() => {
        // autoplay bloqueado
      });
    }
  }, [state, current?.key]);

  function advance(nextState: DeckState = "playing") {
    const nextIndex = index + 1;
    if (nextIndex >= deck.length) {
      setShowSummary(true);
      setState("empty");
      return;
    }
    setIndex(nextIndex);
    setDrag({ x: 0, active: false });
    setState(nextState);
  }

  function goBack() {
    if (index > 0) {
      setIndex(index - 1);
      setDrag({ x: 0, active: false });
      // O sessionCount não diminui para manter o histórico de quantas foram avaliadas na sessão
    }
  }

  function favorite() {
    if (!current) return;
    addFavorite({
      key: current.key,
      title: current.title,
      artist: current.artist,
      image: current.image,
      appleUrl: current.appleUrl,
      genre: current.genre,
      previewUrl: current.previewUrl,
      source: "listen-match",
    });
    setSessionCount((c) => c + 1);
    setSessionFavs((c) => c + 1);
    onFavoritesChanged();
    advance();
  }

  function reject() {
    if (!current) return;
    addRejected({ key: current.key, title: current.title, artist: current.artist });
    setSessionCount((c) => c + 1);
    advance();
  }

  function replay() {
    const el = audioRef.current;
    if (el && current?.previewUrl) {
      el.currentTime = 0;
      el.play().catch(() => {});
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    setDrag({ x: 0, active: true });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.active) return;
    setDrag({
      x: e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left - 120,
      active: true,
    });
  }
  function onPointerUp() {
    if (!drag.active) return;
    const threshold = 80;
    if (drag.x > threshold) favorite();
    else if (drag.x < -threshold) reject();
    else setDrag({ x: 0, active: false });
  }

  const favorites = useMemo(() => getFavorites(), [showSummary]);

  if (showSummary) {
    return (
      <div className="lm-overlay">
        <div className="lm-summary">
          <p className="eyebrow">SESSÃO ENCERRADA</p>
          <h2>Garimpagem concluída</h2>
          <div className="lm-summary-stats">
            <div>
              <span>Avaliadas</span>
              <strong>{sessionCount}</strong>
            </div>
            <div>
              <span>Favoritadas</span>
              <strong>{sessionFavs}</strong>
            </div>
            <div>
              <span>Na coleção</span>
              <strong>{favorites.length}</strong>
            </div>
          </div>
          <div className="lm-summary-actions">
            <button className="btn-primary" type="button" onClick={loadDeck}>
              Nova sessão ↻
            </button>
            <button className="btn-ghost" type="button" onClick={onClose}>
              Voltar ao site
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lm-overlay">
      <div className="lm-panel">
        <div className="lm-header">
          <div>
            <p className="eyebrow">LISTEN & MATCH</p>
            <h2>Escute. Guarde. Descarte.</h2>
          </div>
          <button className="radar-details-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {state === "loading" && <p className="status">Preparando cartas...</p>}
        {state === "error" && (
          <>
            <p className="status error">{error}</p>
            <button className="btn-primary" type="button" onClick={loadDeck}>
              Tentar de novo
            </button>
          </>
        )}
        {state === "empty" && !showSummary && (
          <div className="lm-empty">
            <p>
              Sem mais cartas disponíveis para{" "}
              <strong>{seed.track}</strong>. Inicie uma nova sessão ou volte.
            </p>
            <button className="btn-primary" type="button" onClick={loadDeck}>
              Recomeçar
            </button>
          </div>
        )}

        {state === "playing" && current && (
          <>
            <div className="lm-progress">
              {index + 1} / {deck.length}
            </div>

            <div
              className="lm-card"
              style={{
                transform: `translateX(${drag.x}px) rotate(${drag.x * 0.04}deg)`,
                transition: drag.active ? "none" : "transform .25s ease",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <div className="lm-cover-wrap">
                <div
                  className="lm-vinyl"
                  style={{ backgroundImage: `url(${vinylTexture})` }}
                  aria-hidden="true"
                />
                {current.image ? (
                  <img className="lm-cover" src={current.image} alt="" />
                ) : (
                  <div className="lm-cover lm-cover-placeholder">♫</div>
                )}
              </div>

              <div className="lm-info">
                <p className="eyebrow">{current.genre || "FAIXA"}</p>
                <h3>{current.title}</h3>
                <p className="lm-artist">{current.artist}</p>
                <p className="lm-match">
                  Afinidade estimada: <strong>{Math.round(current.match * 100)}%</strong>
                </p>

                {current.previewUrl ? (
                  <audio
                    ref={audioRef}
                    controls
                    preload="none"
                    src={current.previewUrl}
                    className="lm-audio"
                  >
                    Seu navegador não suporta áudio.
                  </audio>
                ) : (
                  <div className="lm-no-audio">
                    <p>Prévia indisponível nesta fonte.</p>
                    {current.appleUrl && (
                      <a href={current.appleUrl} target="_blank" rel="noreferrer">
                        Ouvir no iTunes ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="lm-actions">
              <button 
                className="lm-btn" 
                type="button" 
                onClick={goBack} 
                disabled={index === 0}
                title="Voltar para a música anterior"
              >
                ← Voltar
              </button>
              <button className="lm-btn lm-btn-reject" type="button" onClick={reject}>
                ✕ Descartar
              </button>
              <button
                className="lm-btn lm-btn-replay"
                type="button"
                onClick={replay}
                disabled={!current.previewUrl}
              >
                ↻ Ouvir de novo
              </button>
              <button className="lm-btn lm-btn-fav" type="button" onClick={favorite}>
                ♥ Favoritar
              </button>
            </div>
            <p className="lm-hint">
              Arraste o cartão para os lados ou use os botões.
            </p>
          </>
        )}
      </div>
    </div>
  );
}