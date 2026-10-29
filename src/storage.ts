// Persistência simples em localStorage — sem login.
// Estrutura versionada para futura migração a server-side.

export type FavoriteTrack = {
  key: string;
  title: string;
  artist: string;
  image?: string;
  url?: string;
  appleUrl?: string;
  genre?: string;
  previewUrl?: string;
  addedAt: number;
  source: "radar" | "listen-match" | "manual";
};

export type RejectedTrack = {
  key: string;
  title: string;
  artist: string;
  rejectedAt: number;
};

const FAV_KEY = "meluvia:favorites:v1";
const REJ_KEY = "meluvia:rejected:v1";
const LM_START_KEY = "meluvia:lm-start:v1";

export function trackKey(title: string, artist: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return `${norm(title)}-${norm(artist)}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignora quota/private mode
  }
}

export function getFavorites(): FavoriteTrack[] {
  return read<FavoriteTrack[]>(FAV_KEY, []);
}

export function addFavorite(track: Omit<FavoriteTrack, "addedAt">): FavoriteTrack[] {
  const list = getFavorites();
  if (list.some((f) => f.key === track.key)) return list;
  const next = [{ ...track, addedAt: Date.now() }, ...list];
  write(FAV_KEY, next);
  return next;
}

export function removeFavorite(key: string): FavoriteTrack[] {
  const next = getFavorites().filter((f) => f.key !== key);
  write(FAV_KEY, next);
  return next;
}

export function isFavorite(key: string): boolean {
  return getFavorites().some((f) => f.key === key);
}

export function getRejected(): RejectedTrack[] {
  return read<RejectedTrack[]>(REJ_KEY, []);
}

export function addRejected(track: Omit<RejectedTrack, "rejectedAt">): RejectedTrack[] {
  const list = getRejected();
  if (list.some((r) => r.key === track.key)) return list;
  const next = [{ ...track, rejectedAt: Date.now() }, ...list].slice(0, 200);
  write(REJ_KEY, next);
  return next;
}

export function getRejectedKeys(): Set<string> {
  return new Set(getRejected().map((r) => r.key));
}

export function setListenMatchStart(key: string | null) {
  if (key) write(LM_START_KEY, key);
  else localStorage.removeItem(LM_START_KEY);
}

export function getListenMatchStart(): string | null {
  try {
    return localStorage.getItem(LM_START_KEY);
  } catch {
    return null;
  }
}