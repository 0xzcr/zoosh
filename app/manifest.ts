import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zoosh",
    short_name: "Zoosh",
    description: "Group expenses, thoughtfully settled.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0d",
    theme_color: "#0a0a0d",
    icons: [],
  };
}
