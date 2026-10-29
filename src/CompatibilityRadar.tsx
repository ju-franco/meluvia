import { useState } from "react";
import type { SimilarTrack } from "./types/types";

type Props = {
  seedTitle: string;
  seedArtist: string;
  tracks: SimilarTrack[];
  onFavorite: (track: SimilarTrack) => void;
  favorites: Set<string>;
};

// Radar radial SVG: cada faixa é um eixo. Raio = match Last.fm (0–1).
// Rótulo honesto: "afinidade estimada (Last.fm)".
export default function CompatibilityRadar({
  seedTitle,
  seedArtist,
  tracks,
  onFavorite,
  favorites,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const size = 380;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 140;

  const items = tracks.slice(0, 12);
  const angleStep = (Math.PI * 2) / Math.max(1, items.length);

  const points = items.map((t, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = Math.max(8, Math.min(1, t.match) * maxR);
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      angle,
      r,
      track: t,
      index: i,
    };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");
  const active = activeIndex != null ? items[activeIndex] : null;

  return (
    <div className="radar-wrap">
      <div className="radar-header">
        <p className="eyebrow">RADAR DE AFINIDADE</p>
        <h3>Por que essas faixas combinam</h3>
        <p className="radar-hint">
          Afinidade estimada pela Last.fm (co-ocorrência de scrobbles). Não é
          medição acústica — é um sinal de proximidade de ouvintes.
        </p>
      </div>

      <div className="radar-body">
        <svg
          className="radar-svg"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Radar de afinidade musical"
        >
          {/* anéis guia */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <circle
              key={f}
              cx={cx}
              cy={cy}
              r={maxR * f}
              fill="none"
              stroke="#e5e3df"
              strokeDasharray="2 4"
            />
          ))}

          {/* eixos */}
          {points.map((p) => (
            <line
              key={`axis-${p.index}`}
              x1={cx}
              y1={cy}
              x2={cx + Math.cos(p.angle) * maxR}
              y2={cy + Math.sin(p.angle) * maxR}
              stroke="#eee"
            />
          ))}

          {/* polígono */}
          {points.length >= 3 && (
            <polygon
              points={polygon}
              fill="rgba(242, 140, 114, 0.18)"
              stroke="var(--primary)"
              strokeWidth={1.5}
            />
          )}

          {/* pontos */}
          {points.map((p) => {
            const isFav = favorites.has(p.track.key ?? "");
            return (
              <g
                key={`pt-${p.index}`}
                className={`radar-point ${activeIndex === p.index ? "is-active" : ""}`}
                onClick={() =>
                  setActiveIndex(activeIndex === p.index ? null : p.index)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveIndex(activeIndex === p.index ? null : p.index);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Ver fatores de ${p.track.title}`}
              >
                <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={activeIndex === p.index ? 6 : 4}
                  fill={isFav ? "var(--primary-dark)" : "var(--primary)"}
                />
              </g>
            );
          })}

          {/* centro = seed */}
          <circle cx={cx} cy={cy} r={6} fill="#111" />
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            fontSize="10"
            fill="#777"
            letterSpacing="1"
          >
            VOCÊ
          </text>
        </svg>

        <div className="radar-legend">
          <p className="radar-legend-label">FAIXAS NO RADAR</p>
          <ol className="radar-legend-list">
            {items.map((t, i) => {
              const fav = favorites.has(t.key ?? "");
              return (
                <li key={t.key ?? `${t.title}-${i}`}>
                  <button
                    type="button"
                    className={`radar-legend-item ${activeIndex === i ? "is-active" : ""}`}
                    onClick={() =>
                      setActiveIndex(activeIndex === i ? null : i)
                    }
                  >
                    <span className="radar-legend-match">
                      {Math.round(t.match * 100)}%
                    </span>
                    <span className="radar-legend-text">
                      <strong>{t.title}</strong>
                      <small>{t.artist}</small>
                    </span>
                    {fav && <span className="radar-legend-fav">♥</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {active && (
        <div className="radar-details" aria-live="polite">
          <div className="radar-details-head">
            <div>
              <p className="eyebrow">FATORES DE AFINIDADE</p>
              <h4>
                {active.title} <span>· {active.artist}</span>
              </h4>
            </div>
            <button
              className="radar-details-close"
              type="button"
              onClick={() => setActiveIndex(null)}
              aria-label="Fechar detalhes"
            >
              ×
            </button>
          </div>

          <ul className="radar-factors">
            <li>
              <strong>Afinidade Last.fm:</strong>{" "}
              {Math.round(active.match * 100)}% — estimativa baseada em quantos
              ouvintes escutam as duas faixas, não em análise sonora.
            </li>
            {active.genre && (
              <li>
                <strong>Gênero (iTunes):</strong> {active.genre}
              </li>
            )}
            {active.reason && (
              <li>
                <strong>Origem:</strong> {active.reason}
              </li>
            )}
            {active.previewUrl ? (
              <li>
                <strong>Prévia de áudio:</strong>{" "}
                <audio
                  controls
                  preload="none"
                  src={active.previewUrl}
                  className="radar-audio"
                >
                  Seu navegador não suporta áudio.
                </audio>
              </li>
            ) : (
              <li>
                <strong>Prévia de áudio:</strong> indisponível nesta fonte.
              </li>
            )}
          </ul>

          <div className="radar-details-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onFavorite(active)}
              disabled={favorites.has(active.key ?? "")}
            >
              {favorites.has(active.key ?? "") ? "Já guardada ♥" : "Guardar ♥"}
            </button>
            {active.appleUrl && (
              <a
                className="btn-ghost"
                href={active.appleUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ouvir no iTunes ↗
              </a>
            )}
          </div>
          <p className="radar-seed-note">
            Comparado com <strong>{seedTitle}</strong> — {seedArtist}
          </p>
        </div>
      )}
    </div>
  );
}