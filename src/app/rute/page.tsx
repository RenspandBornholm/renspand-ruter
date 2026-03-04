"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Customer = {
  id: string;
  name: string;
  address: string;
  city: string;
  pickup_day: string;
  lat: number | null;
  lng: number | null;
};

const DAYS = ["Alle", "Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"] as const;

function dayColor(day: string) {
  // Vælg de farver du synes om – de her er nemme at skelne
  switch (day) {
    case "Man":
      return "#3b82f6"; // blå
    case "Tir":
      return "#22c55e"; // grøn
    case "Ons":
      return "#f59e0b"; // orange
    case "Tor":
      return "#a855f7"; // lilla
    case "Fre":
      return "#ef4444"; // rød
    case "Lør":
      return "#14b8a6"; // turkis
    case "Søn":
      return "#e11d48"; // pink/rød
    default:
      return "#64748b"; // grå
  }
}

function svgPin(color: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24">
    <path fill="${color}" d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function KortPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState<(typeof DAYS)[number]>("Alle");
  const [city, setCity] = useState<string>("Alle");

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  async function loadCustomers() {
    setError(null);

    const { data, error } = await supabase
      .from("customers")
      .select("id,name,address,city,pickup_day,lat,lng")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setCustomers((data ?? []) as Customer[]);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      await loadCustomers();
      setLoading(false);
    })();
  }, [router]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) {
      if (c.city?.trim()) set.add(c.city.trim());
    }
    return ["Alle", ...Array.from(set).sort((a, b) => a.localeCompare(b, "da"))];
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const okDay = day === "Alle" ? true : c.pickup_day === day;
      const okCity = city === "Alle" ? true : c.city === city;
      return okDay && okCity;
    });
  }, [customers, day, city]);

  const customersWithCoords = useMemo(() => {
    return filteredCustomers.filter((c) => c.lat != null && c.lng != null);
  }, [filteredCustomers]);

  function openGoogleMapsRoute(points: { lat: number; lng: number; label?: string }[]) {
    const usable = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (usable.length < 2) {
      alert("Vælg mindst 2 kunder med koordinater for at lave en rute.");
      return;
    }

    const origin = `${usable[0].lat},${usable[0].lng}`;
    const destination = `${usable[usable.length - 1].lat},${usable[usable.length - 1].lng}`;
    const waypoints = usable.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");

    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "") +
      `&travelmode=driving`;

    window.open(url, "_blank");
  }

  async function initMapIfNeeded() {
    if (mapRef.current) return;
    if (!mapDivRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

    if (!apiKey) {
      setError("Mangler NEXT_PUBLIC_GOOGLE_MAPS_API_KEY i .env.local");
      return;
    }

    // Load script én gang
    if (!(window as any).google?.maps) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-google-maps="1"]');
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("Google Maps script load failed")));
          return;
        }

        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
        s.async = true;
        s.defer = true;
        s.dataset.googleMaps = "1";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Google Maps script load failed"));
        document.head.appendChild(s);
      });
    }

    const g = (window as any).google as typeof google;

    mapRef.current = new g.maps.Map(mapDivRef.current, {
      center: { lat: 55.1, lng: 14.9 },
      zoom: 10,
      mapTypeControl: true,
      mapId: mapId || undefined,
    });

    infoWindowRef.current = new g.maps.InfoWindow();
  }

  function clearMarkers() {
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
  }

  function renderMarkers() {
    const g = (window as any).google as typeof google;
    const map = mapRef.current;
    if (!map || !g?.maps) return;

    clearMarkers();

    if (!customersWithCoords.length) return;

    const bounds = new g.maps.LatLngBounds();

    for (const c of customersWithCoords) {
      const pos = { lat: c.lat!, lng: c.lng! };
      bounds.extend(pos);

      const color = dayColor(c.pickup_day);
      const iconUrl = svgPin(color);

      const marker = new g.maps.Marker({
        map,
        position: pos,
        title: `${c.name} (${c.pickup_day})`,
        icon: {
          url: iconUrl,
          scaledSize: new g.maps.Size(34, 34),
        },
      });

      marker.addListener("click", () => {
        const addr = `${c.address}, ${c.city}`;
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

        const html = `
          <div style="font-family: Arial; min-width: 220px;">
            <div style="font-size:14px; font-weight:700;">${c.name}</div>
            <div style="margin-top:4px; font-size:13px;">${addr}</div>
            <div style="margin-top:6px; font-size:13px;">
              <b>Tømmedag:</b> ${c.pickup_day}
            </div>
            <div style="margin-top:10px;">
              <a href="${mapsLink}" target="_blank" rel="noopener noreferrer">
                Åbn adresse i Google Maps
              </a>
            </div>
          </div>
        `;

        infoWindowRef.current?.setContent(html);
        infoWindowRef.current?.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
    }

    if (customersWithCoords.length >= 2) {
      map.fitBounds(bounds, 80);
    } else {
      map.setCenter(bounds.getCenter());
      map.setZoom(12);
    }
  }

  useEffect(() => {
    (async () => {
      if (loading) return;
      try {
        await initMapIfNeeded();
        renderMarkers();
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, day, city, customers]);

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Kort</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Dag:</span>
          <select value={day} onChange={(e) => setDay(e.target.value as any)} style={{ padding: "6px 10px" }}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>By:</span>
          <select value={city} onChange={(e) => setCity(e.target.value)} style={{ padding: "6px 10px" }}>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ opacity: 0.85 }}>
          Viser: {filteredCustomers.length} kunder (pins kræver lat/lng)
        </div>

        <button
          onClick={() =>
            openGoogleMapsRoute(customersWithCoords.map((c) => ({ lat: c.lat!, lng: c.lng!, label: c.name })))
          }
          style={{ padding: "6px 10px", marginLeft: "auto" }}
        >
          Åbn rute i Google Maps
        </button>

        <button onClick={() => router.push("/rute")} style={{ padding: "6px 10px" }}>
          Gå til Dagens rute
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <div
        ref={mapDivRef}
        style={{
          marginTop: 16,
          width: "100%",
          height: 520,
          borderRadius: 12,
          border: "1px solid #333",
          overflow: "hidden",
          background: "#111",
        }}
      />
    </div>
  );
}