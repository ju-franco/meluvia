
export type Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  url: string;
};

export async function searchMusic(query: string): Promise<Track[]> {
  const params = new URLSearchParams({
    term: query,
    entity: "song",
    country: "BR",
    limit: "10",
  });

  const response = await fetch(
    `https://itunes.apple.com/search?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("Não foi possível pesquisar as músicas.");
  }

  const data = await response.json();

  return data.results.map((item: any) => ({
    id: item.trackId,
    title: item.trackName,
    artist: item.artistName,
    album: item.collectionName ?? "Álbum não informado",
    artwork: item.artworkUrl100 ?? "",
    url: item.trackViewUrl ?? "",
  }));
}
