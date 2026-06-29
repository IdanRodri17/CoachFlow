// lib/video.ts — parse and validate demo-video URLs (YouTube / Vimeo).
//
// Exercises store a `video_url`. To embed it we need the provider + the video's
// ID. This helper turns a pasted URL into { provider, id } (or null if it's not
// a recognized YouTube/Vimeo link), and gives us a simple validity check for the
// add/edit form.

export type VideoSource = {
  provider: "youtube" | "vimeo";
  id: string;
};

/**
 * Recognizes the common URL shapes:
 *   YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
 *            youtube.com/shorts/ID
 *   Vimeo:   vimeo.com/ID, vimeo.com/video/ID, player.vimeo.com/video/ID
 * Returns null for anything else.
 */
export function parseVideoUrl(url: string): VideoSource | null {
  const u = url.trim();
  if (!u) return null;

  // YouTube IDs are 11 chars of [A-Za-z0-9_-].
  const youtube = u.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  if (youtube) return { provider: "youtube", id: youtube[1] };

  // Vimeo IDs are numeric.
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { provider: "vimeo", id: vimeo[1] };

  return null;
}

/** True if the string is a recognizable YouTube or Vimeo link. */
export function isValidVideoUrl(url: string): boolean {
  return parseVideoUrl(url) !== null;
}
