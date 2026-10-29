import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { searchMusic, type Track } from "./musicSearch";
import vinylTexture from "./assets/vinyl.png";
import meluviaLogo from "./assets/logo.png";
import "./App.css";

import CompatibilityRadar from "./CompatibilityRadar";
import ConnectionWeb from "./ConnectionWeb";
import ListenMatch from "./ListenMatch";
import {
  addFavorite,
  getFavorites,
  getRejectedKeys,
  isFavorite,
  trackKey,
  removeFavorite,
  type FavoriteTrack,
} from "./storage";
import type {
  Analysis,
  AnalysisTarget,
  Recommendation,
  SimilarTrack,
  TagItem,
  SimilarArtist,
  IndirectTrack,
} from "./types/types";

// Tipos de painel exclusivo por música
type ActivePanel = "connections" | "analysis" | "map" | "listenmatch" | null;

function getSpotifySearchUrl(title: string, artist = "") {
  const searchTerm = `${title} ${artist}`.trim();
  return `https://open.spotify.com/search/${encodeURIComponent(searchTerm)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDuration(ms: number) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [suggestions, setSuggestions] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingMoreRecommendations, setLoadingMoreRecommendations] = useState(false);
  const [error, setError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const [favoritesList, setFavoritesList] = useState<FavoriteTrack[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const favoritesSet = useMemo(
    () => new Set(favoritesList.map((f) => f.key)),
    [favoritesList]
  );

  // Estado unificado de painel ativo — apenas UM por vez
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [webArtist, setWebArtist] = useState<string | null>(null);

  const [recsPage, setRecsPage] = useState(1);
  const [recsHasMore, setRecsHasMore] = useState(false);

  useEffect(() => {
    setFavoritesList(getFavorites());
  }, []);

  const refreshFavorites = useCallback(() => {
    setFavoritesList(getFavorites());
  }, []);

  useEffect(() => {
    const searchTerm = query.trim();
    if (searchTerm.length < 2 || !suggestionsOpen) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const results = await searchMusic(searchTerm);
        if (!cancelled) setSuggestions(results.slice(0, 6));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, suggestionsOpen]);

  // Fecha todos os painéis — helper central
  const closeAllPanels = useCallback(() => {
    setActivePanel(null);
    setAnalysisTarget(null);
    setAnalysis(null);
    setAnalysisError("");
    setLoadingAnalysis(false);
    setWebArtist(null);
  }, []);

  // Alterna painel — se já está aberto, fecha; senão, troca
  function togglePanel(panel: Exclude<ActivePanel, null>) {
    if (activePanel === panel) {
      closeAllPanels();
    } else {
      setActivePanel(panel);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setTracks([]);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSelectedTrack(null);
    setRecommendations([]);
    setRecommendationError("");
    setRecsPage(1);
    setRecsHasMore(false);
    closeAllPanels();

    try {
      const results = await searchMusic(query.trim());
      setTracks(results);
      if (results.length === 0) {
        setError("Nenhuma faixa encontrada. Tente outro título ou artista.");
      }
    } catch {
      setError("Não foi possível buscar as músicas. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectTrack(track: Track) {
    setSelectedTrack(track);
    setQuery(`${track.title} — ${track.artist}`);
    setTracks((current) => {
      const alreadyIncluded = current.some((item) => item.id === track.id);
      return alreadyIncluded ? current : [track, ...current];
    });
    setSuggestions([]);
    setSuggestionsOpen(false);
    setRecommendations([]);
    setRecommendationError("");
    setRecsPage(1);
    setRecsHasMore(false);
    closeAllPanels();
  }

  // --- Busca de recomendações ---
  async function fetchRecommendationsPage(
    track: Track,
    page: number,
    excludeKeys: Set<string>
  ): Promise<{ items: Recommendation[]; hasMore: boolean }> {
    const params = new URLSearchParams({
      track: track.title,
      artist: track.artist,
      page: String(page),
    });
    if (excludeKeys.size > 0) {
      params.set("exclude", Array.from(excludeKeys).join(","));
    }
    const response = await fetch(`/api/recommendations?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Não foi possível buscar recomendações.");
    }
    const items = (data.recommendations ?? []).map((r: any) => ({
      ...r,
      key: r.key ?? trackKey(r.title, r.artist),
    }));
    return { items, hasMore: Boolean(data.hasMore) };
  }

  async function handleDiscoverRelated() {
    if (!selectedTrack) return;

    setLoadingRecommendations(true);
    setRecommendations([]);
    setRecommendationError("");
    setRecsPage(1);
    setRecsHasMore(false);

    try {
      const rejected = getRejectedKeys();
      const { items, hasMore } = await fetchRecommendationsPage(
        selectedTrack,
        1,
        rejected
      );
      setRecommendations(items);
      setRecsHasMore(hasMore);
      if (items.length === 0) {
        setRecommendationError(
          "Não encontramos músicas semelhantes para essa faixa. Tente outra música."
        );
      }
    } catch {
      setRecommendationError(
        "Não foi possível carregar as recomendações. Confira se o backend está rodando e tente novamente."
      );
    } finally {
      setLoadingRecommendations(false);
    }
  }

  async function handleLoadMore() {
    if (!selectedTrack || loadingMoreRecommendations || !recsHasMore) return;

    setLoadingMoreRecommendations(true);
    try {
      const nextPage = recsPage + 1;
      const seen = new Set<string>([
        ...recommendations.map((r) => r.key ?? trackKey(r.title, r.artist)),
        ...getRejectedKeys(),
      ]);
      const { items, hasMore } = await fetchRecommendationsPage(
        selectedTrack,
        nextPage,
        seen
      );
      if (items.length === 0) {
        setRecsHasMore(false);
      } else {
        setRecommendations((prev) => [...prev, ...items]);
        setRecsPage(nextPage);
        setRecsHasMore(hasMore);
      }
    } catch {
      setRecommendationError(
        "Não foi possível carregar mais faixas agora. Tente novamente."
      );
    } finally {
      setLoadingMoreRecommendations(false);
    }
  }

  async function handleAnalyze(target: AnalysisTarget) {
    setAnalysisTarget(target);
    setAnalysis(null);
    setAnalysisError("");
    setLoadingAnalysis(true);

    try {
      const params = new URLSearchParams({
        track: target.title,
        artist: target.artist,
      });
      if (target.album) params.set("album", target.album);
      const response = await fetch(`/api/analysis?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível analisar a música.");
      }

      const enriched: Analysis = {
        ...data,
        similarTracks: (data.similarTracks ?? []).map((t: SimilarTrack) => ({
          ...t,
          key: trackKey(t.title, t.artist),
        })),
      };
      setAnalysis(enriched);
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a análise musical."
      );
    } finally {
      setLoadingAnalysis(false);
    }
  }

  function handleFavoriteFromRadar(track: SimilarTrack) {
    const key = track.key ?? trackKey(track.title, track.artist);
    addFavorite({
      key,
      title: track.title,
      artist: track.artist,
      image: track.artwork,
      appleUrl: track.appleUrl,
      genre: track.genre,
      previewUrl: track.previewUrl,
      source: "radar",
    });
    refreshFavorites();
  }

  function handleFavoriteRecommendation(rec: Recommendation) {
    const key = rec.key ?? trackKey(rec.title, rec.artist);
    if (isFavorite(key)) {
      removeFavorite(key);
    } else {
      addFavorite({
        key,
        title: rec.title,
        artist: rec.artist,
        image: rec.image,
        appleUrl: rec.appleUrl,
        genre: rec.genre,
        previewUrl: rec.previewUrl,
        source: "manual",
      });
    }
    refreshFavorites();
  }

  function openWeb(artist: string) {
    setWebArtist(artist);
    setActivePanel("map");
  }

  const availableTags = analysis?.tags.filter((t) => t.name) ?? [];
  const availableArtistTags = analysis?.artistTags.filter((t) => t.name) ?? [];
  const availableArtists = analysis?.similarArtists.filter((a) => a.name) ?? [];
  const availableSimilarTracks = analysis?.similarTracks.filter((t) => t.title && t.artist) ?? [];
  const availableIndirectTracks = analysis?.indirectTracks.filter((t) => t.title && t.artist) ?? [];

  const hasDirectSimilarity = availableSimilarTracks.length > 0;
  const hasIndirectRecommendations = !hasDirectSimilarity && availableIndirectTracks.length > 0;

  return (
    <main className="app">
      <header className="header">
        <a className="logo logo-image" href="/" aria-label="Melúvia — início">
          <img src={meluviaLogo} alt="Melúvia" className="logo-img" />
        </a>
        <div className="header-right">
          <button
            className="fav-badge"
            type="button"
            onClick={() => setFavoritesOpen((v) => !v)}
            aria-label="Abrir favoritos"
          >
            ♥ {favoritesList.length}
          </button>
          <span className="header-label">SEU RADAR MUSICAL</span>
        </div>
      </header>

      {favoritesOpen && (
        <section className="favorites-panel">
          <div className="favorites-head">
            <p className="eyebrow">SUA COLEÇÃO</p>
            <button
              className="radar-details-close"
              onClick={() => setFavoritesOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          {favoritesList.length === 0 ? (
            <p className="status">Nada guardado ainda. Descubra e clique em ♥.</p>
          ) : (
            <ul className="favorites-list">
              {favoritesList.map((f) => (
                <li key={f.key} className="favorite-item">
                  {f.image ? (
                    <img src={f.image} alt="" className="favorite-cover" />
                  ) : (
                    <span className="favorite-cover favorite-placeholder">♫</span>
                  )}
                  <div className="favorite-info">
                    <strong>{f.title}</strong>
                    <small>{f.artist}</small>
                  </div>
                  <button
                    className="favorite-remove"
                    type="button"
                    onClick={() => {
                      removeFavorite(f.key);
                      refreshFavorites();
                    }}
                    aria-label="Remover favorito"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              setFavoritesOpen(false);
              if (selectedTrack) setActivePanel("listenmatch");
            }}
            disabled={!selectedTrack}
          >
            {selectedTrack
              ? "Iniciar Listen & Match a partir desta faixa"
              : "Selecione uma faixa primeiro"}
          </button>
        </section>
      )}

      <section className="hero">
        <p className="eyebrow">DESCUBRA NOVAS CONEXÕES</p>
        <h1>
          Comece por uma música. O resto é <span>descoberta</span>.
        </h1>
        <p className="subtitle">
          Descubra artistas, explore afinidades e encontre sons que ainda não entraram no seu radar.        
        </p>
        <form className="search-form" onSubmit={handleSearch}>
          <span className="search-icon">⌕</span>
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSuggestionsOpen(true);
              setError("");
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSuggestionsOpen(false);
            }}
            placeholder="Música + artista, ou só o título..."
            aria-label="Pesquisar música ou artista"
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? "Buscando..." : "Buscar ↗"}
          </button>

          {suggestionsOpen && query.trim().length >= 2 && (
            <div className="suggestions-dropdown">
              {loadingSuggestions && (
                <p className="suggestions-status">Procurando correspondências...</p>
              )}
              {!loadingSuggestions && suggestions.length > 0 && (
                <>
                  <p className="suggestions-heading">MÚSICAS ENCONTRADAS</p>
                  {suggestions.map((track) => (
                    <button
                      className="suggestion-item"
                      type="button"
                      key={track.id}
                      onClick={() => handleSelectTrack(track)}
                    >
                      {track.artwork ? (
                        <img className="suggestion-cover" src={track.artwork} alt="" />
                      ) : (
                        <span className="suggestion-cover suggestion-placeholder">♫</span>
                      )}
                      <span className="suggestion-info">
                        <span className="suggestion-title">{track.title}</span>
                        <span className="suggestion-artist">{track.artist}</span>
                      </span>
                      <span className="suggestion-plus">+</span>
                    </button>
                  ))}
                </>
              )}
              {!loadingSuggestions && suggestions.length === 0 && (
                <p className="suggestions-status">Nenhuma correspondência encontrada.</p>
              )}
            </div>
          )}
        </form>
        <p className="hint">
          EXPERIMENTE: Pesquise sua faixa favorita do momento
        </p> 
      </section>

      {selectedTrack && (
        <section className="selected-section-vinyl">
          <div className="vinyl-hero">
            <div className="vinyl-container">
              <div
                className="vinyl-disc"
                style={{ backgroundImage: `url(${vinylTexture})` }}
              ></div>
              {selectedTrack.artwork ? (
                <img
                  className="selected-cover-vinyl"
                  src={selectedTrack.artwork}
                  alt={`Capa do álbum ${selectedTrack.album}`}
                />
              ) : (
                <div className="selected-cover-vinyl selected-cover-placeholder">
                  ♫
                </div>
              )}
            </div>

            <div className="vinyl-info">
              <p className="eyebrow vinyl-eyebrow">SUA MÚSICA ESCOLHIDA</p>
              <h2>{selectedTrack.title}</h2>
              <p>{selectedTrack.artist}</p>
              <span className="album-name">{selectedTrack.album}</span>

              <div className="selected-actions">
                <div className="feature-buttons" role="group" aria-label="Funcionalidades da faixa">
                  <button
                    className={`feature-btn ${activePanel === "connections" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      const willOpen = activePanel !== "connections";
                      togglePanel("connections");
                      if (willOpen && recommendations.length === 0 && !loadingRecommendations) {
                        handleDiscoverRelated();
                      }
                    }}
                    aria-pressed={activePanel === "connections"}
                    disabled={loadingRecommendations}
                  >
                    <span className="feature-btn-icon" aria-hidden="true">✦</span>
                    {loadingRecommendations ? "Buscando..." : "Encontrar conexões"}
                  </button>
                  <button
                    className={`feature-btn ${activePanel === "analysis" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      const willOpen = activePanel !== "analysis";
                      togglePanel("analysis");
                      if (willOpen) {
                        handleAnalyze({
                          title: selectedTrack.title,
                          artist: selectedTrack.artist,
                          image: selectedTrack.artwork,
                          album: selectedTrack.album,
                        });
                      }
                    }}
                    aria-pressed={activePanel === "analysis"}
                  >
                    <span className="feature-btn-icon" aria-hidden="true">◉</span>
                    Raio-X da faixa
                  </button>
                  <button
                    className={`feature-btn ${activePanel === "map" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      const willOpen = activePanel !== "map";
                      if (willOpen) {
                        setWebArtist(selectedTrack.artist);
                        setActivePanel("map");
                      } else {
                        closeAllPanels();
                      }
                    }}
                    aria-pressed={activePanel === "map"}
                  >
                    <span className="feature-btn-icon" aria-hidden="true">✳</span>
                    Mapa de conexões
                  </button>
                  <button
                    className={`feature-btn ${activePanel === "listenmatch" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => togglePanel("listenmatch")}
                    aria-pressed={activePanel === "listenmatch"}
                  >
                    <span className="feature-btn-icon" aria-hidden="true">♫</span>
                    Listen & Match
                  </button>
                </div>
                <button
                  className="remove-track-btn"
                  type="button"
                  onClick={() => {
                    setSelectedTrack(null);
                    setRecommendations([]);
                    setRecommendationError("");
                    closeAllPanels();
                  }}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>

          {/* === PAINÉIS EXCLUSIVOS === */}
          <div className="panel-slot" aria-live="polite">
            {activePanel === "listenmatch" && selectedTrack && (
              <ListenMatch
                seed={{ track: selectedTrack.title, artist: selectedTrack.artist }}
                onClose={() => closeAllPanels()}
                onFavoritesChanged={refreshFavorites}
              />
            )}

            {activePanel === "map" && webArtist && (
              <ConnectionWeb
                centerArtist={webArtist}
                seedTrack={selectedTrack.title}
                onRecenter={(artist) => setWebArtist(artist)}
                onOpenArtist={(artist) => setWebArtist(artist)}
              />
            )}

            {activePanel === "analysis" && analysisTarget && (
              <section className="music-analysis" aria-live="polite">
                <div className="analysis-heading">
                  <div>
                    <p className="eyebrow">POR DENTRO DA MÚSICA</p>
                    <h2>Raio-X da faixa</h2>
                  </div>
                  <button
                    className="clear-selection"
                    type="button"
                    onClick={() => closeAllPanels()}
                    aria-label="Fechar análise"
                  >
                    ×
                  </button>
                </div>

                {loadingAnalysis && <p className="status">Investigando conexões...</p>}
                {analysisError && <p className="status error">{analysisError}</p>}

                {analysis && !loadingAnalysis && (
                  <>
                    {analysis.iTunes && (analysis.iTunes.genre || analysis.iTunes.releaseDate) && (
                      <div className="analysis-facts">
                        {analysis.iTunes.genre && (
                          <span><strong>Gênero:</strong> {analysis.iTunes.genre}</span>
                        )}
                        {analysis.iTunes.releaseDate && (
                          <span><strong>Lançamento:</strong> {formatDate(analysis.iTunes.releaseDate)}</span>
                        )}
                        {analysis.iTunes.durationMs > 0 && (
                          <span><strong>Duração:</strong> {formatDuration(analysis.iTunes.durationMs)}</span>
                        )}
                      </div>
                    )}

                    <div className="analysis-stats">
                      <article className="analysis-stat">
                        <span>OUVINTES</span>
                        <strong>{analysis.track.listeners ? formatNumber(analysis.track.listeners) : "—"}</strong>
                      </article>
                      <article className="analysis-stat">
                        <span>REPRODUÇÕES</span>
                        <strong>{analysis.track.playcount ? formatNumber(analysis.track.playcount) : "—"}</strong>
                      </article>
                      <article className="analysis-stat">
                        <span>TAGS</span>
                        <strong>{availableTags.length + availableArtistTags.length}</strong>
                      </article>
                    </div>

                    <div className="analysis-grid">
                      <article className="analysis-panel">
                        <p className="eyebrow">IDENTIDADE SONORA</p>
                        <h3>Estilos e tags</h3>
                        {availableTags.length > 0 ? (
                          <>
                            <p className="tag-source-label">Da faixa</p>
                            <div className="tag-constellation">
                              {availableTags.map((tag: TagItem, index: number) => (
                                <a
                                  key={`${tag.name}-${index}`}
                                  href={getSpotifySearchUrl(tag.name)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="music-tag"
                                >
                                  {tag.name}
                                </a>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="analysis-empty">Nenhuma tag para esta faixa.</p>
                        )}
                        {availableArtistTags.length > 0 && (
                          <>
                            <p className="tag-source-label">Do artista</p>
                            <div className="tag-constellation">
                              {availableArtistTags.map((tag: TagItem, index: number) => (
                                <a
                                  key={`artist-${tag.name}-${index}`}
                                  href={getSpotifySearchUrl(tag.name)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="music-tag"
                                >
                                  {tag.name}
                                </a>
                              ))}
                            </div>
                          </>
                        )}
                      </article>

                      <article className="analysis-panel analysis-panel-radar">
                        <p className="eyebrow">AFINIDADE ESTIMADA</p>
                        <h3>Radar de compatibilidade</h3>
                        {availableSimilarTracks.length > 0 ? (
                          <CompatibilityRadar
                            seedTitle={analysis.track.title}
                            seedArtist={analysis.track.artist}
                            tracks={availableSimilarTracks}
                            onFavorite={handleFavoriteFromRadar}
                            favorites={favoritesSet}
                          />
                        ) : (
                          <p className="analysis-empty">
                            Sem faixas semelhantes suficientes para montar o radar.
                          </p>
                        )}
                      </article>
                    </div>

                    {hasIndirectRecommendations && (
                      <article className="analysis-panel analysis-panel-full indirect-panel">
                        <p className="eyebrow">RECOMENDAÇÕES INDIRETAS</p>
                        <h3>Faixas de artistas relacionados</h3>
                        <div className="indirect-list">
                          {availableIndirectTracks.map((track: IndirectTrack, index: number) => (
                            <div className="indirect-card" key={`${track.title}-${index}`}>
                              <div className="indirect-info">
                                <a
                                  href={getSpotifySearchUrl(track.title, track.artist)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="indirect-title"
                                >
                                  {track.title}
                                </a>
                                <span className="indirect-artist">{track.artist}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}

                    <article className="analysis-panel analysis-panel-full connection-panel">
                      <p className="eyebrow">UNIVERSO MUSICAL</p>
                      <h3>Artistas relacionados</h3>
                      {availableArtists.length > 0 ? (
                        <div className="connection-list">
                          {availableArtists.slice(0, 8).map((artist: SimilarArtist, index: number) => (
                            <button
                              className="connection-node"
                              key={`${artist.name}-${index}`}
                              type="button"
                              onClick={() => openWeb(artist.name)}
                            >
                              <span className="connection-node-icon">✳</span>
                              <span>{artist.name}</span>
                              <small>
                                {Math.round(artist.match * 100)}% de relação — clique para abrir no mapa
                              </small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="analysis-empty">Nenhum artista relacionado.</p>
                      )}
                    </article>
                  </>
                )}
              </section>
            )}

            {activePanel === "connections" && (
              <section className="connections-panel" aria-live="polite">
                <div className="analysis-heading">
                  <div>
                    <p className="eyebrow">PRÓXIMO SOM FAVORITO</p>
                    <h2>Músicas conectadas</h2>
                  </div>
                  <button
                    className="clear-selection"
                    type="button"
                    onClick={() => closeAllPanels()}
                    aria-label="Fechar conexões"
                  >
                    ×
                  </button>
                </div>

                {loadingRecommendations && (
                  <p className="status text-center">Buscando conexões...</p>
                )}
                {recommendationError && (
                  <p className="status error text-center">{recommendationError}</p>
                )}

                {recommendations.length > 0 && (
                  <>
                    <div className="recommendation-list">
                      {recommendations.map((recommendation, index) => {
                        const key = recommendation.key ?? trackKey(recommendation.title, recommendation.artist);
                        const fav = favoritesSet.has(key);
                        return (
                          <article className="recommendation-card" key={`${key}-${index}`}>
                            {recommendation.image ? (
                              <img className="recommendation-cover" src={recommendation.image} alt="" />
                            ) : (
                              <div className="recommendation-cover recommendation-placeholder">♫</div>
                            )}
                            <div className="recommendation-info">
                              <h3>{recommendation.title}</h3>
                              <p>{recommendation.artist}</p>
                              <small className="rec-match">
                                Afinidade estimada: {Math.round(recommendation.match * 100)}%
                              </small>
                            </div>
                            <button
                              className={`rec-fav ${fav ? "is-fav" : ""}`}
                              type="button"
                              onClick={() => handleFavoriteRecommendation(recommendation)}
                              aria-label={fav ? "Remover dos favoritos" : "Guardar"}
                            >
                              {fav ? "♥" : "♡"}
                            </button>
                            <a
                              className="track-link"
                              href={getSpotifySearchUrl(recommendation.title, recommendation.artist)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ↗
                            </a>
                          </article>
                        );
                      })}
                    </div>

                    <div className="load-more-wrap">
                      {recsHasMore ? (
                        <button
                          className="load-more-btn"
                          type="button"
                          onClick={handleLoadMore}
                          disabled={loadingMoreRecommendations}
                        >
                          {loadingMoreRecommendations ? "Garimpando..." : "Garimpar mais faixas"}
                        </button>
                      ) : (
                        <p className="load-more-end">Não há mais faixas semelhantes por aqui.</p>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </section>
      )}

      <section className="results">
        {loading && <p className="status">Procurando músicas...</p>}
        {error && <p className="status error">{error}</p>}

        {!loading && tracks.length > 0 && (
          <>
            <h2 className="results-title">Encontramos estas faixas</h2>
            <p className="results-description">
              Escolha a versão correta conferindo o artista e o álbum.
            </p>

            <div className="track-list-modern">
              {tracks.map((track, index) => (
                <article
                  className={`modern-track-row ${selectedTrack?.id === track.id ? "is-selected" : ""}`}
                  key={track.id}
                >
                  <div className="track-index">{String(index + 1).padStart(2, "0")}</div>

                  <div className="track-cover-wrapper">
                    <div
                      className="vinyl-mini-disc"
                      style={{ backgroundImage: `url(${vinylTexture})` }}
                    ></div>
                    {track.artwork ? (
                      <img className="track-cover-modern" src={track.artwork} alt="" />
                    ) : (
                      <div className="track-cover-modern track-symbol">♫</div>
                    )}
                  </div>

                  <button
                    className="modern-track-info"
                    type="button"
                    onClick={() => handleSelectTrack(track)}
                  >
                    <h3>{track.title}</h3>
                    <p>{track.artist}</p>
                  </button>

                  <div className="track-actions">
                    <a
                      className="track-link-modern"
                      href={getSpotifySearchUrl(track.title, track.artist)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ↗
                    </a>
                    <button className="track-menu-btn" aria-label="Opções">
                      •••
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <footer>
        <span>meluvia</span>
        <span>Encontre sua próxima faixa favorita</span>
      </footer>
    </main>
  );
}

export default App;