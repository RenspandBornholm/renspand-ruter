"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stop = {
  id: string;
  order_index: number;
  status: "planned" | "done" | "skipped";
  note: string | null;
  customer: {
    id: string;
    name: string;
    address: string;
    city: string;
    lat: number;
    lng: number;
  };
  bins: Array<{
    bin_type: string;
    pickup_day: string; // Søn/Man/...
    week_group: string | null;
    frequency_months: number | null;
  }>;
};

type Props = {
  mapId: string;
  hq: { lat: number; lng: number; label: string };
  stops: Stop[];
};

export default function MapClient({ mapId, hq, stops }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);

  const activeStop = useMemo(
    () => stops.find(s => s.id === activeStopId) || null,
    [stops, activeStopId]
  );

  useEffect(() => {
    if (!mapRef.current) return;
    if (!window.google?.maps) return;

    // Init map kun én gang
    if (!mapObjRef.current) {
      mapObjRef.current = new google.maps.Map(mapRef.current, {
        center: { lat: hq.lat, lng: hq.lng },
        zoom: 11,
        mapId: mapId || undefined,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      });
    }

    const map = mapObjRef.current;

    // Ryd gamle markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // HQ marker
    const hqMarker = new google.maps.Marker({
      position: { lat: hq.lat, lng: hq.lng },
      map,
      title: hq.label,
      label: "HQ",
    });
    markersRef.current.push(hqMarker);

    // Stop markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: hq.lat, lng: hq.lng });

    for (const s of stops) {
      const marker = new google.maps.Marker({
        position: { lat: s.customer.lat, lng: s.customer.lng },
        map,
        title: s.customer.name,
        label: String(s.order_index + 1),
      });

      marker.addListener("click", () => setActiveStopId(s.id));
      markersRef.current.push(marker);
      bounds.extend({ lat: s.customer.lat, lng: s.customer.lng });
    }

    // FitBounds (kun hvis vi har noget)
    if (stops.length > 0) {
      map.fitBounds(bounds, 60);
    } else {
      map.setCenter({ lat: hq.lat, lng: hq.lng });
      map.setZoom(12);
    }
  }, [mapId, hq.lat, hq.lng, hq.label, stops]);

  const openRouteInGoogleMaps = () => {
    // Google Maps URL: origin + destination + waypoints
    const origin = `${hq.lat},${hq.lng}`;
    const ordered = [...stops].sort((a, b) => a.order_index - b.order_index);

    if (ordered.length === 0) {
      alert("Ingen stops på ruten endnu.");
      return;
    }

    const destination = `${ordered[ordered.length - 1].customer.lat},${ordered[ordered.length - 1].customer.lng}`;
    const waypointStops = ordered.slice(0, -1);

    const waypoints = waypointStops
      .map(s => `${s.customer.lat},${s.customer.lng}`)
      .join("|");

    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    if (waypoints) url.searchParams.set("waypoints", waypoints);
    url.searchParams.set("travelmode", "driving");

    window.open(url.toString(), "_blank");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 12 }}>
      <div
        ref={mapRef}
        style={{
          height: "70vh",
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.1)",
        }}
      />
      <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12 }}>
        <button onClick={openRouteInGoogleMaps} style={{ width: "100%", padding: 12 }}>
          Åbn rute (Google Maps)
        </button>

        <hr style={{ margin: "12px 0" }} />

        {activeStop ? (
          <>
            <h3 style={{ margin: "0 0 6px 0" }}>{activeStop.customer.name}</h3>
            <div style={{ marginBottom: 8 }}>
              {activeStop.customer.address}, {activeStop.customer.city}
            </div>
            <div style={{ marginBottom: 8 }}>
              <b>Status:</b> {activeStop.status}
            </div>

            <div style={{ marginBottom: 8 }}>
              <b>Spande / plan:</b>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {activeStop.bins.map((b, idx) => (
                  <li key={idx}>
                    {b.bin_type} – {b.pickup_day} – uge: {b.week_group ?? "alle"} – hver {b.frequency_months ?? "?"} mdr
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <b>Note:</b> {activeStop.note ?? "—"}
            </div>
          </>
        ) : (
          <div>Tryk på en marker for info.</div>
        )}
      </div>
    </div>
  );
}