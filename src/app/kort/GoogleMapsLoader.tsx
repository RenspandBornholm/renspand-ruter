"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
  }
}

type Props = {
  children: React.ReactNode;
};

export default function GoogleMapsLoader({ children }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "";
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scriptSrc = useMemo(() => {
    // v=weekly giver stabil nyere loader
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      libraries: "marker", // kan fjernes hvis I ikke bruger AdvancedMarker
    });
    return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
  }, [apiKey]);

  useEffect(() => {
    window.gm_authFailure = () => {
      setErr("gm_authFailure: Google afviser din API key (restrictions/billing/API enabled).");
      setReady(false);
    };
    return () => {
      // cleanup
      if (window.gm_authFailure) delete window.gm_authFailure;
    };
  }, []);

  useEffect(() => {
    // Hvis google allerede findes (hot reload), så markér ready
    if (window.google?.maps) setReady(true);
  }, []);

  // Debug (vises på siden)
  const debug = (
    <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.9 }}>
      <div>mapsReady: {ready ? "YES" : "NO"}</div>
      <div>apiKey: {apiKey ? `${apiKey.slice(0, 6)}...` : "MISSING"}</div>
      <div>mapId: {mapId ? mapId : "MISSING"}</div>
      {err ? <div style={{ color: "crimson" }}>error: {err}</div> : null}
    </div>
  );

  if (!apiKey) {
    return (
      <div style={{ padding: 16 }}>
        {debug}
        <p>Mangler NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</p>
      </div>
    );
  }

  return (
    <>
      <Script
        src={scriptSrc}
        strategy="afterInteractive"
        onLoad={() => {
          if (window.google?.maps) setReady(true);
          else setErr("Script loaded, men window.google.maps findes ikke (blokeret?)");
        }}
        onError={() => setErr("Kunne ikke loade Google Maps script (netværk/adblock?).")}
      />

      <div style={{ padding: 8 }}>{debug}</div>

      {ready ? (
        children
      ) : (
        <div style={{ padding: 16 }}>
          <p>Loader Google Maps…</p>
          {err ? <p style={{ color: "crimson" }}>{err}</p> : null}
        </div>
      )}
    </>
  );
}