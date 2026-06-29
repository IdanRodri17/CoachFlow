// components/ExerciseVideo.tsx — embeds an exercise's demo video.
//
// YouTube links render with react-native-youtube-iframe (nice native controls).
// Vimeo links render in a plain WebView pointing at Vimeo's embed player.
// Both ultimately use react-native-webview under the hood. Renders nothing if
// there's no video or the URL isn't a recognized YouTube/Vimeo link.

import { View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { WebView } from "react-native-webview";

import { parseVideoUrl } from "@/lib/video";

const VIDEO_HEIGHT = 220;

export function ExerciseVideo({ url }: { url: string | null | undefined }) {
  const source = url ? parseVideoUrl(url) : null;
  if (!source) return null;

  if (source.provider === "youtube") {
    return (
      <View className="overflow-hidden rounded-xl bg-black">
        <YoutubePlayer height={VIDEO_HEIGHT} videoId={source.id} />
      </View>
    );
  }

  // Vimeo
  return (
    <View
      className="overflow-hidden rounded-xl bg-black"
      style={{ height: VIDEO_HEIGHT }}
    >
      <WebView
        source={{ uri: `https://player.vimeo.com/video/${source.id}` }}
        allowsFullscreenVideo
        // Let the iframe size itself; the wrapper View fixes the height.
        style={{ backgroundColor: "black" }}
      />
    </View>
  );
}
