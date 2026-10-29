export type Recommendation = {
  title: string;
  artist: string;
  url: string;
  appleUrl: string;
  image: string;
  previewUrl?: string;
  genre?: string;
  match: number;
  key?: string;
};

export type TagItem = { name: string; url: string };

export type SimilarTrack = {
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
  key?: string;
};

export type SimilarArtist = {
  name: string;
  url: string;
  match: number;
  image?: string;
};

export type IndirectTrack = {
  title: string;
  artist: string;
  url: string;
  viaArtist: string;
  viaArtistUrl: string;
  reason: string;
};

export type ITunesMeta = {
  genre: string;
  releaseDate: string;
  durationMs: number;
  album: string;
  artwork: string;
  trackViewUrl: string;
  previewUrl: string;
} | null;

export type Analysis = {
  source: string;
  track: {
    title: string;
    artist: string;
    url: string;
    listeners: number;
    playcount: number;
    album: string;
  };
  tags: TagItem[];
  tagsSource: "track.getInfo" | "track.getTopTags" | "artist" | "none";
  artistTags: TagItem[];
  similarTracks: SimilarTrack[];
  similarArtists: SimilarArtist[];
  indirectTracks: IndirectTrack[];
  iTunes: ITunesMeta;
  available: {
    trackInfo: boolean;
    similarTracks: boolean;
    similarArtists: boolean;
    trackTopTags: boolean;
    artistInfo: boolean;
    iTunes: boolean;
  };
};

export type AnalysisTarget = {
  title: string;
  artist: string;
  image?: string;
  album?: string;
};