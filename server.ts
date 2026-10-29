import express from "express";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

const app = express();
const PORT = 3001;

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Servidor do Meluvia funcionando!" });
});

async function lastFmRequest(
  apiKey: string,
  method: string,
  params: Record<string, string>
): Promise<any> {
  const searchParams = new URLSearchParams({
    method,
    api_key: apiKey,
    format: "json",
    ...params,
  });

  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?${searchParams.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Last.fm respondeu com status ${response.status}.`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.message ?? "Erro retornado pelo Last.fm.");
  }

  return data;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

type TagItem = { name: string; url: string };

type SimilarTrack = {
  title: string;
  artist: string;
  url: string;
  match: number;
  reason: string;
  source: string;
  genre?: string;
  previewUrl?: string;
  artwork?: string;
  appleUrl?: string;
};

type SimilarArtist = {
  name: string;
  url: string;
  match: number;
  image?: string;
};

type IndirectTrack = {
  title: string;
  artist: string;
  url: string;
  viaArtist: string;
  viaArtistUrl: string;
  reason: string;
};

type ITunesMeta = {
  genre: string;
  releaseDate: string;
  durationMs: number;
  album: string;
  artwork: string;
  trackViewUrl: string;
  previewUrl: string;
} | null;

async function fetchITunesRaw(
  title: string,
  artist: string
): Promise<any | null> {
  try {
    const params = new URLSearchParams({
      term: `${title} ${artist}`,
      entity: "song",
      country: "BR",
      limit: "5",
    });

    const response = await fetch(
      `https://itunes.apple.com/search?${params.toString()}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];

    const exact = results.find(
      (r: any) =>
        normalize(r.trackName ?? "") === normalize(title) &&
        normalize(r.artistName ?? "") === normalize(artist)
    );

    return exact ?? results[0] ?? null;
  } catch (error) {
    console.warn(
      "Falha ao consultar iTunes:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

async function fetchITunesMeta(
  title: string,
  artist: string
): Promise<ITunesMeta> {
  const best = await fetchITunesRaw(title, artist);
  if (!best) return null;

  return {
    genre: String(best.primaryGenreName ?? ""),
    releaseDate: String(best.releaseDate ?? ""),
    durationMs: Number(best.trackTimeMillis ?? 0),
    album: String(best.collectionName ?? ""),
    artwork: String(best.artworkUrl100 ?? "").replace("100x100", "300x300"),
    trackViewUrl: String(best.trackViewUrl ?? ""),
    previewUrl: String(best.previewUrl ?? ""),
  };
}

// Concorrência controlada para não estourar o rate limit do iTunes/Last.fm.
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      try {
        results[current] = await fn(items[current], current);
      } catch {
        results[current] = undefined as unknown as R;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ============ /api/track-preview ============
// Dado título + artista, retorna preview iTunes (30s) ou null honesto.
app.get("/api/track-preview", async (req, res) => {
  const track =
    typeof req.query.track === "string" ? req.query.track.trim() : "";
  const artist =
    typeof req.query.artist === "string" ? req.query.artist.trim() : "";

  if (!track || !artist) {
    res.status(400).json({ error: "Informe track e artist." });
    return;
  }

  const meta = await fetchITunesMeta(track, artist);

  if (!meta || !meta.previewUrl) {
    res.json({
      available: false,
      reason: "Sem prévia pública nesta fonte (iTunes).",
      track,
      artist,
      appleUrl: meta?.trackViewUrl ?? "",
    });
    return;
  }

  res.json({
    available: true,
    previewUrl: meta.previewUrl,
    artwork: meta.artwork,
    genre: meta.genre,
    appleUrl: meta.trackViewUrl,
    source: "iTunes",
  });
});

// ============ /api/analysis ============
app.get("/api/analysis", async (req, res) => {
  const track =
    typeof req.query.track === "string" ? req.query.track.trim() : "";
  const artist =
    typeof req.query.artist === "string" ? req.query.artist.trim() : "";
  const album =
    typeof req.query.album === "string" ? req.query.album.trim() : "";
  const apiKey = process.env.LASTFM_API_KEY;

  if (!track || !artist) {
    res.status(400).json({ error: "Informe o nome da música e do artista." });
    return;
  }

  if (!apiKey) {
    res.status(500).json({
      error: "A chave da API do Last.fm não foi configurada.",
    });
    return;
  }

  try {
    const [
      trackInfoResult,
      similarTracksResult,
      similarArtistsResult,
      trackTopTagsResult,
      artistInfoResult,
      iTunesMeta,
    ] = await Promise.allSettled([
      lastFmRequest(apiKey, "track.getInfo", { artist, track, autocorrect: "1" }),
      lastFmRequest(apiKey, "track.getSimilar", {
        artist,
        track,
        limit: "10",
        autocorrect: "1",
      }),
      lastFmRequest(apiKey, "artist.getSimilar", {
        artist,
        limit: "10",
        autocorrect: "1",
      }),
      lastFmRequest(apiKey, "track.getTopTags", {
        artist,
        track,
        autocorrect: "1",
      }),
      lastFmRequest(apiKey, "artist.getInfo", { artist, autocorrect: "1" }),
      fetchITunesMeta(track, artist),
    ]);

    const trackInfo =
      trackInfoResult.status === "fulfilled" ? trackInfoResult.value.track : null;
    const similarTracksData =
      similarTracksResult.status === "fulfilled"
        ? similarTracksResult.value
        : null;
    const similarArtistsData =
      similarArtistsResult.status === "fulfilled"
        ? similarArtistsResult.value
        : null;
    const trackTopTagsData =
      trackTopTagsResult.status === "fulfilled"
        ? trackTopTagsResult.value
        : null;
    const artistInfoData =
      artistInfoResult.status === "fulfilled"
        ? artistInfoResult.value.artist
        : null;
    const iTunes = iTunesMeta.status === "fulfilled" ? iTunesMeta.value : null;

    if (!trackInfo && !similarTracksData && !similarArtistsData && !artistInfoData) {
      res.status(502).json({
        error: "Não foi possível obter a análise musical do Last.fm.",
      });
      return;
    }

    let tags: TagItem[] = asArray(trackInfo?.toptags?.tag).map((tag: any) => ({
      name: String(tag.name ?? ""),
      url: String(tag.url ?? ""),
    }));

    let tagsSource: "track.getInfo" | "track.getTopTags" | "artist" | "none" =
      tags.length > 0 ? "track.getInfo" : "none";

    if (tags.length === 0 && trackTopTagsData) {
      tags = asArray(trackTopTagsData.toptags?.tag).map((tag: any) => ({
        name: String(tag.name ?? ""),
        url: String(tag.url ?? ""),
      }));
      if (tags.length > 0) tagsSource = "track.getTopTags";
    }

    const artistTags: TagItem[] = asArray(artistInfoData?.tags?.tag).map(
      (tag: any) => ({
        name: String(tag.name ?? ""),
        url: String(tag.url ?? ""),
      })
    );

    const similarArtists: SimilarArtist[] = asArray(
      similarArtistsData?.similarartists?.artist
    ).map((item: any) => {
      const images = asArray(item.image);
      const large = images.find((img: any) => img.size === "extralarge");
      const medium = images.find((img: any) => img.size === "large");
      return {
        name: String(item.name ?? ""),
        url: String(item.url ?? ""),
        match: Number(item.match ?? 0),
        image: String(large?.["#text"] ?? medium?.["#text"] ?? ""),
      };
    });

    const directSimilarTracksBase = asArray(
      similarTracksData?.similartracks?.track
    ).map((item: any) => ({
      title: String(item.name ?? ""),
      artist: String(item.artist?.name ?? "Artista desconhecido"),
      url: String(item.url ?? ""),
      match: Number(item.match ?? 0),
      reason: "Similaridade informada pela Last.fm.",
      source: "track.getSimilar",
    }));

    // Enriquece com iTunes (preview + genre + artwork), com limite de concorrência.
    const enriched: SimilarTrack[] = await mapWithLimit(
      directSimilarTracksBase,
      3,
      async (item) => {
        const meta = await fetchITunesMeta(item.title, item.artist);
        return {
          ...item,
          genre: meta?.genre || undefined,
          previewUrl: meta?.previewUrl || undefined,
          artwork: meta?.artwork || undefined,
          appleUrl: meta?.trackViewUrl || undefined,
        };
      }
    );

    let indirectTracks: IndirectTrack[] = [];

    if (directSimilarTracksBase.length === 0 && similarArtists.length > 0) {
      const topArtists = similarArtists.slice(0, 4);

      const results = await Promise.allSettled(
        topArtists.map(async (relatedArtist) => {
          try {
            const data = await lastFmRequest(apiKey, "artist.getTopTracks", {
              artist: relatedArtist.name,
              limit: "3",
              autocorrect: "1",
            });

            const tracks = asArray(data.toptracks?.track);

            return tracks.map((item: any) => ({
              title: String(item.name ?? ""),
              artist: String(item.artist?.name ?? relatedArtist.name),
              url: String(item.url ?? ""),
              viaArtist: relatedArtist.name,
              viaArtistUrl: relatedArtist.url,
              reason: `Faixa popular de ${relatedArtist.name}, artista relacionado a ${artist}.`,
            }));
          } catch {
            return [];
          }
        })
      );

      const seedKey = `${normalize(track)}-${normalize(artist)}`;

      indirectTracks = dedupeByKey(
        results
          .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
          .filter(
            (item) =>
              item.title &&
              item.artist &&
              `${normalize(item.title)}-${normalize(item.artist)}` !== seedKey
          ),
        (item) => `${normalize(item.title)}-${normalize(item.artist)}`
      ).slice(0, 8);
    }

    res.json({
      source: "Last.fm",
      track: {
        title: String(trackInfo?.name ?? track),
        artist: String(trackInfo?.artist?.name ?? artist),
        url: String(trackInfo?.url ?? ""),
        listeners: Number(trackInfo?.listeners ?? 0),
        playcount: Number(trackInfo?.playcount ?? 0),
        album: String(trackInfo?.album?.title ?? album ?? ""),
      },
      tags,
      tagsSource,
      artistTags,
      similarTracks: enriched,
      similarArtists,
      indirectTracks,
      iTunes,
      available: {
        trackInfo: trackInfoResult.status === "fulfilled",
        similarTracks: similarTracksResult.status === "fulfilled",
        similarArtists: similarArtistsResult.status === "fulfilled",
        trackTopTags: trackTopTagsResult.status === "fulfilled",
        artistInfo: artistInfoResult.status === "fulfilled",
        iTunes: Boolean(iTunes),
      },
    });
  } catch (error) {
    console.error("Erro na análise musical:", error);
    res.status(500).json({ error: "Ocorreu um erro ao analisar a música." });
  }
});

// ============ /api/recommendations ============
// Mantém comportamento antigo (sem page) e adiciona paginação + exclude.
app.get("/api/recommendations", async (req, res) => {
  const track =
    typeof req.query.track === "string" ? req.query.track.trim() : "";
  const artist =
    typeof req.query.artist === "string" ? req.query.artist.trim() : "";
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const excludeParam =
    typeof req.query.exclude === "string" ? req.query.exclude : "";
  const excludeKeys = new Set(
    excludeParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const apiKey = process.env.LASTFM_API_KEY;

  if (!track || !artist) {
    res.status(400).json({ error: "Informe o nome da música e do artista." });
    return;
  }
  if (!apiKey) {
    res.status(500).json({
      error: "A chave da API do Last.fm não foi configurada.",
    });
    return;
  }

  // 10 por página. Ampliamos o limit do Last.fm conforme a página.
  const PAGE_SIZE = 10;
  const upstreamLimit = Math.min(100, page * PAGE_SIZE + PAGE_SIZE);

  try {
    let recommendations: any[] = [];
    let recommendationSource = "faixas semelhantes";

    try {
      const data = await lastFmRequest(apiKey, "track.getSimilar", {
        artist,
        track,
        limit: String(upstreamLimit),
        autocorrect: "1",
      });

      const similarTracks = asArray(data.similartracks?.track);

      recommendations = similarTracks.map((item: any) => ({
        title: String(item.name ?? ""),
        artist: String(item.artist?.name ?? "Artista desconhecido"),
        url: item.url ?? "",
        match: Number(item.match ?? 0),
      }));
    } catch (error) {
      console.warn(
        "A busca por faixas semelhantes falhou:",
        error instanceof Error ? error.message : error
      );
    }

    if (recommendations.length === 0 && page === 1) {
      recommendationSource = "artistas semelhantes";

      try {
        const artistData = await lastFmRequest(apiKey, "artist.getSimilar", {
          artist,
          limit: "8",
          autocorrect: "1",
        });

        const similarArtists = asArray(artistData.similarartists?.artist);

        const artistResults = await Promise.all(
          similarArtists.slice(0, 6).map(async (similarArtist: any) => {
            const similarArtistName = String(similarArtist.name ?? "");
            if (!similarArtistName) return [];
            try {
              const topTracksData = await lastFmRequest(
                apiKey,
                "artist.getTopTracks",
                { artist: similarArtistName, limit: "5", autocorrect: "1" }
              );
              const tracks = asArray(topTracksData.toptracks?.track);
              return tracks.map((item: any) => ({
                title: String(item.name ?? ""),
                artist: String(item.artist?.name ?? similarArtistName),
                url: item.url ?? "",
                match: Number(similarArtist.match ?? 0),
              }));
            } catch {
              return [];
            }
          })
        );

        const seedKey = `${normalize(track)}-${normalize(artist)}`;
        const seen = new Set<string>();

        recommendations = artistResults
          .flat()
          .filter((item: any) => {
            const key = `${normalize(item.title)}-${normalize(item.artist)}`;
            if (!item.title || !item.artist || key === seedKey || seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          });
      } catch (error) {
        console.warn(
          "A busca por artistas semelhantes falhou:",
          error instanceof Error ? error.message : error
        );
      }
    }

    // Chave de deduplicação consistente entre páginas.
    const seedKey = `${normalize(track)}-${normalize(artist)}`;
    const seenThisPage = new Set<string>();

    const filtered = recommendations.filter((item: any) => {
      const key = `${normalize(item.title)}-${normalize(item.artist)}`;
      if (!item.title || !item.artist || key === seedKey) return false;
      if (excludeKeys.has(key)) return false;
      if (seenThisPage.has(key)) return false;
      seenThisPage.add(key);
      return true;
    });

    // Fatia a página: skip = (page-1)*10
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    const hasMore = filtered.length > start + PAGE_SIZE;

    // Enriquece com iTunes (artwork + preview + appleUrl), limite 3.
    const enrichedRecommendations = await mapWithLimit(
      pageItems,
      3,
      async (item: any) => {
        const meta = await fetchITunesMeta(item.title, item.artist);
        return {
          title: item.title,
          artist: item.artist,
          url: item.url,
          appleUrl: meta?.trackViewUrl ?? "",
          image: meta?.artwork ?? "",
          previewUrl: meta?.previewUrl ?? "",
          genre: meta?.genre ?? "",
          match: item.match,
          key: `${normalize(item.title)}-${normalize(item.artist)}`,
        };
      }
    );

    res.json({
      source: "Last.fm",
      strategy: recommendationSource,
      seed: { track, artist },
      page,
      pageSize: PAGE_SIZE,
      hasMore,
      recommendations: enrichedRecommendations.filter(Boolean),
    });
  } catch (error) {
    console.error("Erro ao buscar recomendações:", error);
    res.status(500).json({
      error: "Ocorreu um erro ao buscar recomendações musicais.",
    });
  }
});

// ============ /api/graph ============
// Teia de conexões: centro + artistas similares (anel 1) + artistas
// co-ocorrentes em track.getSimilar e getTopTracks (anel 2).
// Layout calculado aqui (círculos concêntricos). Frontend só renderiza.
app.get("/api/graph", async (req, res) => {
  const track =
    typeof req.query.track === "string" ? req.query.track.trim() : "";
  const artist =
    typeof req.query.artist === "string" ? req.query.artist.trim() : "";
  const apiKey = process.env.LASTFM_API_KEY;

  if (!artist) {
    res.status(400).json({ error: "Informe ao menos o artista central." });
    return;
  }
  if (!apiKey) {
    res.status(500).json({
      error: "A chave da API do Last.fm não foi configurada.",
    });
    return;
  }

  type GraphNode = {
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

  type GraphEdge = {
    source: string;
    target: string;
    weight: number;
    reason: string;
  };

  try {
    // 1. Artista central
    const centerId = `artist:${normalize(artist)}`;

    // 2. Similares do artista (anel 1)
    let ring1: { name: string; match: number; image?: string; url?: string }[] = [];
    try {
      const data = await lastFmRequest(apiKey, "artist.getSimilar", {
        artist,
        limit: "8",
        autocorrect: "1",
      });
      ring1 = asArray(data.similarartists?.artist).map((item: any) => {
        const images = asArray(item.image);
        const large = images.find((img: any) => img.size === "extralarge");
        return {
          name: String(item.name ?? ""),
          match: Number(item.match ?? 0),
          image: String(large?.["#text"] ?? ""),
          url: String(item.url ?? ""),
        };
      }).filter((a) => a.name);
    } catch (error) {
      console.warn("graph: artist.getSimilar falhou", error);
    }

    // 3. Artistas co-ocorrentes via track.getSimilar (se houver track)
    let coArtists: { name: string; match: number }[] = [];
    if (track) {
      try {
        const data = await lastFmRequest(apiKey, "track.getSimilar", {
          artist,
          track,
          limit: "10",
          autocorrect: "1",
        });
        coArtists = asArray(data.similartracks?.track)
          .map((item: any) => ({
            name: String(item.artist?.name ?? ""),
            match: Number(item.match ?? 0),
          }))
          .filter(
            (a) =>
              a.name &&
              normalize(a.name) !== normalize(artist) &&
              !ring1.some((r) => normalize(r.name) === normalize(a.name))
          );
      } catch (error) {
        console.warn("graph: track.getSimilar falhou", error);
      }
    }

    // 4. Arestas entre ring1 (chamadas paralelas controladas)
    const ring1Names = ring1.map((r) => r.name);
    const pairEdges: GraphEdge[] = [];
    const edgeChecks = await mapWithLimit(ring1Names, 3, async (name) => {
      try {
        const data = await lastFmRequest(apiKey, "artist.getSimilar", {
          artist: name,
          limit: "10",
          autocorrect: "1",
        });
        const related = asArray(data.similarartists?.artist).map((item: any) => ({
          name: String(item.name ?? ""),
          match: Number(item.match ?? 0),
        }));
        return { from: name, related };
      } catch {
        return { from: name, related: [] as { name: string; match: number }[] };
      }
    });

    for (const check of edgeChecks) {
      if (!check) continue;
      for (const rel of check.related) {
        if (ring1Names.includes(rel.name)) {
          // Evita duplicar A→B e B→A
          const idA = `artist:${normalize(check.from)}`;
          const idB = `artist:${normalize(rel.name)}`;
          if (idA < idB) {
            pairEdges.push({
              source: idA,
              target: idB,
              weight: rel.match,
              reason: "Similaridade Last.fm entre artistas.",
            });
          }
        }
      }
    }

    // 5. Deduplica coArtists e monta nós
    coArtists = dedupeByKey(
      coArtists,
      (c) => normalize(c.name)
    ).slice(0, 6);

    const nodes: GraphNode[] = [
      {
        id: centerId,
        name: artist,
        type: "artist",
        match: 1,
        ring: 0,
        x: 0,
        y: 0,
      },
    ];

    const W = 900;
    const H = 600;
    const cx = W / 2;
    const cy = H / 2;

    // Anel 1
    const R1 = 170;
    ring1.forEach((r, i) => {
      const angle = (i / Math.max(1, ring1.length)) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: `artist:${normalize(r.name)}`,
        name: r.name,
        type: "artist",
        image: r.image,
        match: r.match,
        ring: 1,
        x: cx + Math.cos(angle) * R1,
        y: cy + Math.sin(angle) * R1,
        url: r.url,
      });
    });

    // Anel 2
    const R2 = 280;
    coArtists.forEach((r, i) => {
      const angle =
        (i / Math.max(1, coArtists.length)) * Math.PI * 2 - Math.PI / 2 + 0.2;
      nodes.push({
        id: `artist:${normalize(r.name)}`,
        name: r.name,
        type: "artist",
        match: r.match,
        ring: 2,
        x: cx + Math.cos(angle) * R2,
        y: cy + Math.sin(angle) * R2,
      });
    });

    // 6. Arestas do centro para todos + pairEdges
    const edges: GraphEdge[] = [];
    for (const n of nodes) {
      if (n.id === centerId) continue;
      edges.push({
        source: centerId,
        target: n.id,
        weight: n.match,
        reason:
          n.ring === 1
            ? "Artista similar direto (Last.fm)."
            : "Artista co-ocorrente em faixas similares (Last.fm).",
      });
    }
    edges.push(...pairEdges);

    res.json({
      source: "Last.fm",
      width: W,
      height: H,
      center: centerId,
      nodes,
      edges,
      available: {
        ring1: ring1.length > 0,
        ring2: coArtists.length > 0,
        pairEdges: pairEdges.length > 0,
      },
    });
  } catch (error) {
    console.error("Erro ao montar o grafo:", error);
    res.status(500).json({ error: "Não foi possível montar o mapa." });
  }
});

app.listen(PORT, () => {
  console.log(`Meluvia API rodando em http://localhost:${PORT}`);
});