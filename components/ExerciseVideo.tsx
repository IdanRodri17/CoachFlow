// components/ExerciseVideo.tsx — embeds an exercise's demo video.
//
// YouTube links render with react-native-youtube-iframe (nice native controls).
// Vimeo links render in a plain WebView pointing at Vimeo's embed player.
// Both ultimately use react-native-webview under the hood. Renders nothing if
// there's no video or the URL isn't a recognized YouTube/Vimeo link.
//
// U3: the box is the design's (client-exercise.html): 16:9 at the screen's
// width, radius 20, ink behind the player — it was the pre-redesign
// NativeWind black box with a fixed 220 height.
//
// 2026-11-27 (Idan: pressing the video opened the YouTube app): `autoPlay`
// starts the video in the app as soon as the player is ready, for the
// posters that already took the tap (one tap plays it, not two). Both
// players play inline.

import { useState } from "react";
import { View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { WebView } from "react-native-webview";

import { parseVideoUrl } from "@/lib/video";
import { colors } from "@/components/ui";

export function ExerciseVideo({ url, autoPlay = false }: { url: string | null | undefined; autoPlay?: boolean }) {
  // The player needs a height in points: 16:9 of the width it's given.
  const [width, setWidth] = useState<number | null>(null);
  const source = url ? parseVideoUrl(url) : null;
  if (!source) return null;
  const height = width != null ? Math.round((width * 9) / 16) : null;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ aspectRatio: 16 / 9, borderRadius: 20, overflow: "hidden", backgroundColor: colors.ink }}
    >
      {height == null ? null : source.provider === "youtube" ? (
        <YoutubePlayer height={height} videoId={source.id} play={autoPlay} />
      ) : (
        <WebView
          source={{ uri: `https://player.vimeo.com/video/${source.id}${autoPlay ? "?autoplay=1" : ""}` }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={!autoPlay}
          allowsFullscreenVideo
          style={{ backgroundColor: colors.ink }}
        />
      )}
    </View>
  );
}
