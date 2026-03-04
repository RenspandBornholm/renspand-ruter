import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RenSpand rute system",
    short_name: "RenSpand",
    start_url: "/kort",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#0b0b0b",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}