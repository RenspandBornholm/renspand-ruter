"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { supabase } from "@/lib/supabaseClient";
import NavTabs from "@/app/components/NavTabs";
import AppHeader from "@/app/components/AppHeader";

type Customer = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};

type RouteDay = {
  id: string;
  route_date: string; // YYYY-MM-DD
  notes: string | null;
};

type RouteStop = {
  id: string;
  route_day_id: string;
  customer_id: string;
  order_index: number;
  status: "planned" | "done" | "skipped";
  done_at: string | null;
  note?: string | null;
  customer?: Customer;
};

type BinRow = {
  id?: string;
  customer_id: string;
  bin_type: string | null;
  pickup_day: string | null;
  week_group: string | null;
  frequency_months: number | null;
};

const DK_WEEKDAYS: Array<{ label: string; value: string; jsDay: number }> = [
  { label: "Søn", value: "Søn", jsDay: 0 },
  { label: "Man", value: "Man", jsDay: 1 },
  { label: "Tir", value: "Tir", jsDay: 2 },
  { label: "Ons", value: "Ons", jsDay: 3 },
  { label: "Tor", value: "Tor", jsDay: 4 },
  { label: "Fre", value: "Fre", jsDay: 5 },
  { label: "Lør", value: "Lør", jsDay: 6 },
];

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return toYMD(dt);
}

// (I beholder jeres week-group helpers — bruges ikke i foreslå længere, men kan være nyttige senere)
function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}
function computeWeekGroup(date: Date) {
  const w = isoWeekNumber(date);
  const parity = w % 2 === 0 ? "lige" : "ulige";
  const abc = ["A", "B", "C"][(w - 1) % 3];
  return { week: w, parity, abc };
}
function matchesWeekGroup(rule: string | null | undefined, date: Date) {
  if (!rule || rule === "" || rule === "alle" || rule === "ingen") return true;

  const r = rule.trim().toLowerCase();
  const { parity, abc } = computeWeekGroup(date);

  if (r === "lige" || r === "lige uger") return parity === "lige";
  if (r === "ulige" || r === "ulige uger") return parity === "ulige";

  if (r === "a" || r === "b" || r === "c") return abc.toLowerCase() === r;

  if (r.includes("c")) return abc === "C";
  if (r.includes("b")) return abc === "B";
  if (r.includes("a")) return abc === "A";

  return true;
}

function binTypeLabel(t: string | null) {
  switch ((t ?? "").toLowerCase()) {
    case "madaffald":
      return "Madaffald";
    case "rest_plast":
      return "Rest + plast";
    case "pap_papir":
      return "Papir/pap";
    case "metal_glas":
      return "Metal/glas";
    default:
      return t ?? "Ukendt";
  }
}

function weekGroupLabel(w: string | null) {
  if (!w) return "—";
  const low = w.toLowerCase();
  if (low === "lige") return "Lige uger";
  if (low === "ulige") return "Ulige uger";
  if (low === "a" || low === "b" || low === "c") return `${w.toUpperCase()}-gruppe`;
  if (low === "alle" || low === "ingen") return "Alle uger";
  return w;
}

// ✅ Ikoner + korte labels til “I dag”
function binIconShort(t: string | null | undefined) {
  switch ((t ?? "").toLowerCase()) {
    case "madaffald":
      return "🍎";
    case "rest_plast":
      return "🗑️";
    case "pap_papir":
      return "📦";
    case "metal_glas":
      return "🍾";
    default:
      return "♻️";
  }
}
function binLabelShort(t: string | null) {
  switch ((t ?? "").toLowerCase()) {
    case "madaffald":
      return "Madaffald";
    case "rest_plast":
      return "Rest + plast";
    case "pap_papir":
      return "Papir/pap";
    case "metal_glas":
      return "Metal/glas";
    default:
      return t ?? "Ukendt";
  }
}

function openGoogleMapsRoute(points: { lat: number; lng: number; label?: string }[]) {
  const usable = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (usable.length < 1) {
    alert("Vælg mindst 1 kunde med koordinater for at lave en rute.");
    return;
  }

  // HQ koordinater
  const HQ = "55.10692093390334,14.822756898314669";
  const endAtHQ = false;

  const origin = HQ;
  const destination = endAtHQ
    ? HQ
    : `${usable[usable.length - 1].lat},${usable[usable.length - 1].lng}`;

  const waypointPoints = endAtHQ ? usable : usable.slice(0, -1);
  const waypoints = waypointPoints.map((p) => `${p.lat},${p.lng}`).join("|");

  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "") +
    `&travelmode=driving`;

  window.open(url, "_blank", "noopener,noreferrer");
}

export default function KortPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialDate = searchParams.get("date") || toYMD(new Date());
  const [routeDate, setRouteDate] = useState<string>(initialDate);
  const [routeDay, setRouteDay] = useState<RouteDay | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);

  // Hold URL i sync med valgt dato
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("date", routeDate);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDate]);

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  // ✅ “I dag” bin-types pr kunde (fra BOFA-datoer)
  const [todayBinsByCustomer, setTodayBinsByCustomer] = useState<Record<string, string[]>>({});

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const [mapsReady, setMapsReady] = useState(false);

  // gm_authFailure (Google afviser key)
  useEffect(() => {
    (window as any).gm_authFailure = () => {
      setError("Google afviste API key (gm_authFailure). Tjek restrictions/billing/API'er i Google Cloud.");
      setMapsReady(false);
    };
    return () => {
      try {
        delete (window as any).gm_authFailure;
      } catch {}
    };
  }, []);

  const selectedPoints = useMemo(() => {
    const pts: { lat: number; lng: number; label?: string }[] = [];
    for (const s of [...stops].sort((a, b) => a.order_index - b.order_index)) {
      const c = s.customer;
      if (c?.lat != null && c?.lng != null) pts.push({ lat: c.lat, lng: c.lng, label: c.name });
    }
    return pts;
  }, [stops]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.push("/login");
    })();
  }, [router]);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,address,city,lat,lng")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setAllCustomers((data ?? []) as Customer[]);
  }

  async function loadOrCreateRouteDay(dateStr: string) {
    const { data: found, error: findErr } = await supabase
      .from("route_days")
      .select("id,route_date,notes")
      .eq("route_date", dateStr)
      .maybeSingle();

    if (findErr) throw findErr;

    if (found) {
      setRouteDay(found as RouteDay);
      return found as RouteDay;
    }

    const { data: created, error: createErr } = await supabase
      .from("route_days")
      .insert({ route_date: dateStr })
      .select("id,route_date,notes")
      .single();

    if (createErr) throw createErr;
    setRouteDay(created as RouteDay);
    return created as RouteDay;
  }

  async function loadStops(routeDayId: string) {
    const { data, error } = await supabase
      .from("route_stops")
      .select("id,route_day_id,customer_id,order_index,status,done_at,note")
      .eq("route_day_id", routeDayId)
      .order("order_index", { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as RouteStop[];
    const map = new Map(allCustomers.map((c) => [c.id, c]));
    const withCustomers = rows.map((r) => ({ ...r, customer: map.get(r.customer_id) }));
    setStops(withCustomers);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadCustomers();
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        if (allCustomers.length === 0) return;
        const rd = await loadOrCreateRouteDay(routeDate);
        await loadStops(rd.id);

        // ✅ når dato skifter: ryd “i dag”-badges (de opdateres når man trykker foreslå)
        setTodayBinsByCustomer({});
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDate, allCustomers.length]);

  // Init map NÅR maps er ready (stabilt)
  useEffect(() => {
    if (!mapsReady) return;
    if (!mapDivRef.current) return;
    if (!(window as any).google?.maps) return;

    const g = (window as any).google as typeof google;

    if (!mapRef.current) {
      const bornholm = { lat: 55.10692093390334, lng: 14.822756898314669 };
      mapRef.current = new g.maps.Map(mapDivRef.current, {
        center: bornholm,
        zoom: 10,
        mapTypeControl: true,
        mapId: mapId || undefined,
      });
      infoWindowRef.current = new g.maps.InfoWindow();
    } else {
      mapRef.current.setOptions({ mapId: mapId || undefined });
    }
  }, [mapsReady, mapId]);

  // Render markers (inkl HQ) når stops ændrer sig
  useEffect(() => {
    const g = (window as any).google as typeof google | undefined;
    const map = mapRef.current;
    if (!g?.maps || !map) return;

    // ryd gamle
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];

    const bounds = new g.maps.LatLngBounds();

    // HQ marker (altid)
    const HQ_POS = { lat: 55.10692093390334, lng: 14.822756898314669 };

    const hqMarker = new g.maps.Marker({
      map,
      position: HQ_POS,
      title: "HQ – Kirkemøllevejen 2, Vestermarie",
      label: "HQ",
    });

    markersRef.current.push(hqMarker);
    bounds.extend(HQ_POS);

    const sorted = [...stops].sort((a, b) => a.order_index - b.order_index);

    for (const s of sorted) {
      const c = s.customer;
      if (c?.lat == null || c?.lng == null) continue;

      const pos = { lat: c.lat, lng: c.lng };
      bounds.extend(pos);

      const marker = new g.maps.Marker({
        map,
        position: pos,
        title: c.name ?? "",
        label: String(s.order_index + 1),
      });

      marker.addListener("click", async () => {
        const addr = `${c.address ?? ""}${c.city ? ", " + c.city : ""}`.trim();
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

        const todayBins = todayBinsByCustomer[c.id] ?? [];
        const todayHtml = todayBins.length
          ? `
            <div style="margin-top:10px;">
              <div style="font-weight:900;margin-bottom:6px;">I dag (${routeDate})</div>
              ${todayBins
                .map(
                  (bt) => `
                <div style="border:1px solid #e6e6e6;border-radius:10px;padding:7px 10px;margin-top:6px;">
                  <div style="font-weight:900;">${binIconShort(bt)} ${binLabelShort(bt)}</div>
                </div>
              `
                )
                .join("")}
            </div>
          `
          : "";

        infoWindowRef.current?.setContent(`
          <div style="font-family: Arial, sans-serif; min-width: 280px; padding: 12px; color:#111;">
            <div style="font-size:18px;font-weight:900;margin-bottom:6px;">${c.name}</div>
            <div style="font-size:14px;line-height:1.45;margin-bottom:10px;">
              ${c.address ?? ""}<br/>${c.city ?? ""}
            </div>

            ${todayHtml}

            <div style="font-weight:900;margin-top:12px;margin-bottom:6px;">Tømmeplan</div>
            <div style="opacity:.8;">Indlæser…</div>
            <div style="margin-top:12px;">
              <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
                 style="display:block; text-align:center; padding:12px; border-radius:14px; border:2px solid #111; text-decoration:none; font-weight:900; color:#111;">
                Åbn i Google Maps
              </a>
            </div>
          </div>
        `);
        infoWindowRef.current?.open({ map, anchor: marker });

        const { data, error } = await supabase
          .from("customer_bins")
          .select("customer_id,bin_type,pickup_day,week_group,frequency_months")
          .eq("customer_id", c.id);

        let planHtml = "";
        if (error) {
          planHtml = `<div style="color:#b00020;font-weight:800;">Kunne ikke hente tømmeplan</div>`;
        } else {
          const rows = (data ?? []) as BinRow[];
          if (rows.length === 0) {
            planHtml = `<div style="opacity:.8;">Ingen tømmeplan gemt.</div>`;
          } else {
            planHtml = rows
              .map((r) => {
                const freq = r.frequency_months ? `${r.frequency_months} md.` : "—";
                const day = r.pickup_day ?? "—";
                const wg = weekGroupLabel(r.week_group);
                return `
                  <div style="border:1px solid #e6e6e6;border-radius:10px;padding:8px 10px;margin-top:8px;">
                    <div style="font-weight:900;">${binTypeLabel(r.bin_type)}</div>
                    <div style="font-size:13px;opacity:.9;margin-top:2px;">
                      Dag: <b>${day}</b> • Uger: <b>${wg}</b> • Frekvens: <b>${freq}</b>
                    </div>
                  </div>
                `;
              })
              .join("");
          }
        }

        const finalHtml = `
          <div style="font-family: Arial, sans-serif; min-width: 300px; padding: 12px; color:#111;">
            <div style="font-size:18px;font-weight:900;margin-bottom:6px;">${c.name}</div>
            <div style="font-size:14px;line-height:1.45;margin-bottom:10px;">
              ${c.address ?? ""}<br/>${c.city ?? ""}
            </div>

            ${todayHtml}

            <div style="font-weight:900;margin-top:12px;margin-bottom:6px;">Tømmeplan</div>
            ${planHtml}

            <div style="margin-top:12px;">
              <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
                 style="display:block; text-align:center; padding:12px; border-radius:14px; border:2px solid #111; text-decoration:none; font-weight:900; color:#111;">
                Åbn i Google Maps
              </a>
            </div>
          </div>
        `;
        infoWindowRef.current?.setContent(finalHtml);
      });

      markersRef.current.push(marker);
    }

    if (markersRef.current.length > 0) map.fitBounds(bounds, 60);
  }, [stops, todayBinsByCustomer, routeDate]);

  async function addCustomerToRoute(customerId: string) {
    if (!routeDay) return;
    const exists = stops.some((s) => s.customer_id === customerId);
    if (exists) return;

    const nextIndex = stops.length;

    const { data, error } = await supabase
      .from("route_stops")
      .insert({
        route_day_id: routeDay.id,
        customer_id: customerId,
        order_index: nextIndex,
        status: "planned",
      })
      .select("id,route_day_id,customer_id,order_index,status,done_at,note")
      .single();

    if (error) throw error;

    const customer = allCustomers.find((c) => c.id === customerId);
    setStops((prev) => [...prev, { ...(data as RouteStop), customer }]);
  }

  async function updateStop(id: string, patch: Partial<RouteStop>) {
    const { error } = await supabase.from("route_stops").update(patch).eq("id", id);
    if (error) throw error;
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // ✅ NY: Gem historik for alle kundens spande
  async function writeServiceHistory(stop: RouteStop, status: "done" | "skipped") {
    const { data: bins, error: binsErr } = await supabase
      .from("customer_bins")
      .select("bin_type")
      .eq("customer_id", stop.customer_id);

    if (binsErr) throw binsErr;

    const rows = ((bins ?? []) as Array<{ bin_type: string | null }>)
      .filter((b) => !!b.bin_type)
      .map((b) => ({
        customer_id: stop.customer_id,
        route_stop_id: stop.id,
        bin_type: b.bin_type as string,
        status,
        serviced_at: new Date().toISOString(),
        note: stop.note ?? null,
      }));

    if (rows.length === 0) return;

    const { error: histErr } = await supabase.from("service_history").insert(rows);
    if (histErr) throw histErr;
  }

  async function setStopNote(stopId: string) {
    const current = stops.find((s) => s.id === stopId)?.note ?? "";
    const txt = prompt("Skriv note til dette stop:", current);
    if (txt === null) return;

    const { error } = await supabase.from("route_stops").update({ note: txt }).eq("id", stopId);
    if (error) throw error;

    setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, note: txt } : s)));
  }

  async function removeStop(id: string) {
    const { error } = await supabase.from("route_stops").delete().eq("id", id);
    if (error) throw error;
    setStops((prev) => prev.filter((s) => s.id !== id));
  }

  async function moveStop(id: string, dir: -1 | 1) {
    const sorted = [...stops].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex((s) => s.id === id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapWith];

    const { error: e1 } = await supabase.from("route_stops").update({ order_index: b.order_index }).eq("id", a.id);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("route_stops").update({ order_index: a.order_index }).eq("id", b.id);
    if (e2) throw e2;

    setStops((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, order_index: b.order_index };
        if (s.id === b.id) return { ...s, order_index: a.order_index };
        return s;
      })
    );
  }

  // ✅ SMART foreslå: brug BOFA-datoer fra bofa_pickups
  async function suggestCustomersForDate() {
    try {
      setError(null);
      const rd = routeDay ?? (await loadOrCreateRouteDay(routeDate));

      const selectedDateYMD =
  routeDate.split("-")[0]?.length === 4
    ? routeDate
    : routeDate.split("-").reverse().join("-");

// ✅ Vi rengør dagen EFTER BOFA har tømt
const pickupDateYMD = addDaysYMD(selectedDateYMD, -1);

      const { data: dateRows, error: dErr } = await supabase
  .from("bofa_pickups")
  .select("customer_id,bin_type,pickup_date")
  .eq("pickup_date", pickupDateYMD);

      if (dErr) throw dErr;

      const rows = (dateRows ?? []) as Array<{ customer_id: string; bin_type: string; pickup_date: string }>;

      if (rows.length === 0) {
        setTodayBinsByCustomer({});
        setError(`Rolig dag – ingen spande klar til rengøring (${pickupDateYMD}) for rutedato ${selectedDateYMD}.`);
        return;
      }

      // Gruppér hvilke bin_types der er i dag pr kunde
      const binsMap: Record<string, string[]> = {};
      for (const r of rows) {
        (binsMap[r.customer_id] ||= []);
        if (!binsMap[r.customer_id].includes(r.bin_type)) binsMap[r.customer_id].push(r.bin_type);
      }
      setTodayBinsByCustomer(binsMap);

      const eligibleIds = Object.keys(binsMap);
      setAdding(true);

      // FIX: lokal tæller til order_index
      let nextIndex = stops.length;

      for (const cid of eligibleIds) {
        if (!stops.some((s) => s.customer_id === cid)) {
          const { data: inserted, error: insErr } = await supabase
            .from("route_stops")
            .insert({
              route_day_id: rd.id,
              customer_id: cid,
              order_index: nextIndex,
              status: "planned",
            })
            .select("id,route_day_id,customer_id,order_index,status,done_at,note")
            .single();

          if (insErr) throw insErr;

          const customer = allCustomers.find((c) => c.id === cid);
          setStops((prev) => [...prev, { ...(inserted as RouteStop), customer }]);

          nextIndex += 1;
        }
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setAdding(false);
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allCustomers
      .filter((c) => (`${c.name} ${c.address ?? ""} ${c.city ?? ""}`).toLowerCase().includes(q))
      .slice(0, 10);
  }, [search, allCustomers]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) return <div style={{ padding: 24, color: "#ddd" }}>Indlæser…</div>;

  const sortedStops = [...stops].sort((a, b) => a.order_index - b.order_index);

  const scriptSrc = apiKey
    ? `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    : "";

  // ✅ Til bundmenu: giv luft i bunden så den ikke dækker indhold på mobil
  const BOTTOM_NAV_H = 76;

  return (
    <div style={{ padding: 24, color: "#ddd", paddingBottom: 24 + BOTTOM_NAV_H }}>
      {/* Google Maps Script (stabil) */}
      {apiKey ? (
        <Script
          src={scriptSrc}
          strategy="afterInteractive"
          onLoad={() => {
            if ((window as any).google?.maps) setMapsReady(true);
            else setError("Google script loaded, men google.maps mangler (adblock eller noget blokerer).");
          }}
          onError={() => setError("Kunne ikke loade Google Maps script (netværk/adblock).")}
        />
      ) : null}

      {/* Mini debug */}
      <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
        mapsReady: {mapsReady ? "YES" : "NO"} • apiKey: {apiKey ? apiKey.slice(0, 6) + "..." : "MISSING"} • mapId:{" "}
        {mapId || "MISSING"}
      </div>

<AppHeader title="RenSpand Ruter" subtitle={`Kort · ${routeDate}`} />      
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0 }}>Kort</h1>
        <button
          onClick={logout}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: "#1f1f1f",
            border: "1px solid #333",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Log ud
        </button>
      </div>

      {error && <div style={{ marginTop: 10, color: "#ff6b6b", fontWeight: 800 }}>{error}</div>}

      <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800 }}>Dato:</span>
          <input
            id="routeDate"
            name="routeDate"
            type="date"
            value={routeDate}
            onChange={(e) => setRouteDate(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#111",
              color: "#fff",
            }}
          />
        </label>

        <button
          onClick={suggestCustomersForDate}
          disabled={adding}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: adding ? "#222" : "#0f2a1b",
            border: "1px solid #2ecc71",
            color: "#dff7e8",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          {adding ? "Finder…" : "Spande klar til rengøring"}
        </button>

        <button
          onClick={() => openGoogleMapsRoute(selectedPoints)}
          disabled={selectedPoints.length < 1}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: selectedPoints.length < 1 ? "#222" : "#1a1a1a",
            border: "1px solid #444",
            color: "#fff",
            cursor: selectedPoints.length < 1 ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          Åbn rute (fra HQ)
        </button>

        <button
          onClick={() => router.push(`/kort/naeste?date=${encodeURIComponent(routeDate)}`)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "#1a1a1a",
            border: "1px solid #444",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          Næste stop (app)
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ minWidth: 320 }}>
          <input
            id="searchCustomer"
            name="searchCustomer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tilføj kunde (søg navn/adresse/by)…"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#111",
              color: "#fff",
            }}
          />
          {filteredCustomers.length > 0 && (
            <div
              style={{
                marginTop: 8,
                background: "#0f0f0f",
                border: "1px solid #2a2a2a",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    try {
                      setError(null);
                      setAdding(true);
                      await addCustomerToRoute(c.id);
                      setSearch("");
                    } catch (e: any) {
                      setError(String(e?.message ?? e));
                    } finally {
                      setAdding(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #1f1f1f",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{c.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {(c.address ?? "").trim()} {c.city ? `, ${c.city}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Mere mobilvenlig grid: auto-fit -> 1 kolonne på små skærme */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 16, padding: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Dagens rute</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>{sortedStops.length} stop</div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedStops.length === 0 && <div style={{ opacity: 0.8 }}>Ingen stop endnu.</div>}

            {sortedStops.map((s, i) => {
              const c = s.customer;
              const statusColor = s.status === "done" ? "#2ecc71" : s.status === "skipped" ? "#ff4d4f" : "#999";
              const todays = todayBinsByCustomer[s.customer_id] ?? [];

              return (
                <div key={s.id} style={{ border: "1px solid #222", borderRadius: 14, padding: 10, background: "#0b0b0b" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 900 }}>
                      {i + 1}. {c?.name ?? "(ukendt)"}{" "}
                      <span style={{ marginLeft: 8, color: statusColor, fontWeight: 900 }}>
                        {s.status === "planned" ? "PLAN" : s.status === "done" ? "RENGJORT" : "IKKE MULIGT"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => moveStop(s.id, -1)}
                        disabled={i === 0}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: "1px solid #333",
                          background: "#111",
                          color: "#fff",
                          cursor: i === 0 ? "not-allowed" : "pointer",
                          fontWeight: 900,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveStop(s.id, 1)}
                        disabled={i === sortedStops.length - 1}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: "1px solid #333",
                          background: "#111",
                          color: "#fff",
                          cursor: i === sortedStops.length - 1 ? "not-allowed" : "pointer",
                          fontWeight: 900,
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    {(c?.address ?? "").trim()} {c?.city ? `, ${c.city}` : ""}
                    {!c?.lat || !c?.lng ? " • (mangler koordinater)" : ""}
                  </div>

                  {/* ✅ I dag badges */}
                  {todays.length ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {todays.map((bt) => (
                        <span
                          key={bt}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: "1px solid #333",
                            background: "#111",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {binIconShort(bt)} {binLabelShort(bt)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {s.note ? (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.95 }}>
                      <b>Note:</b> {s.note}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setStopNote(s.id).catch((e) => setError(String(e?.message ?? e)))}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #333",
                        background: "#101010",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Note
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          const doneAt = new Date().toISOString();
                          await updateStop(s.id, { status: "done", done_at: doneAt });
                          await writeServiceHistory({ ...s, status: "done", done_at: doneAt }, "done");
                        } catch (e: any) {
                          setError(String(e?.message ?? e));
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #2ecc71",
                        background: s.status === "done" ? "#0f2a1b" : "#101010",
                        color: "#dff7e8",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Rengjort
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          await updateStop(s.id, { status: "skipped", done_at: null });
                          await writeServiceHistory({ ...s, status: "skipped", done_at: null }, "skipped");
                        } catch (e: any) {
                          setError(String(e?.message ?? e));
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #ff4d4f",
                        background: s.status === "skipped" ? "#2a0a0a" : "#101010",
                        color: "#ffd6d6",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Ikke muligt
                    </button>

                    <button
                      onClick={() => updateStop(s.id, { status: "planned", done_at: null })}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #444",
                        background: "#101010",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Nulstil
                    </button>

                    <button
                      onClick={() => removeStop(s.id)}
                      style={{
                        marginLeft: "auto",
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #444",
                        background: "#101010",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Fjern
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 16, padding: 14 }}>
          <div
            ref={mapDivRef}
            style={{
              height: 620,
              borderRadius: 14,
              overflow: "hidden",
              background: "#111",
            }}
          />
        </div>
      </div>

      {/* ✅ Bundmenu: Kort / Kunder */}
      <NavTabs />
    </div>
  );
}