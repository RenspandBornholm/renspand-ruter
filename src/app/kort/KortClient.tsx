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
  phone: string | null;
  email: string | null;
};

type RouteDay = {
  id: string;
  route_date: string;
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
  planned_bin_types?: string[] | null;
  customer?: Customer;
};

type BinRow = {
  id?: string;
  customer_id: string;
  bin_type: string | null;
  pickup_day: string | null;
  week_group: string | null;
  frequency_months: number | null;
  is_active?: boolean | null;
};

type PickupRow = {
  customer_id: string;
  bin_type: string;
  pickup_date: string;
};

type BinOpportunityInfo = {
  remainingCount: number;
  nextDate: string | null;
};

type UpcomingRouteRow = {
  date: string;
  stopCount: number;
  doneCount: number;
  skippedCount: number;
  plannedCount: number;
};

type ActiveBinConfigRow = {
  customer_id: string;
  bin_type: string;
  frequency_months: number | null;
  is_active: boolean | null;
};

type ServiceHistoryMiniRow = {
  customer_id: string;
  bin_type: string;
  serviced_at: string;
};

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDMY(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}-${m}-${y}`;
}

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return toYMD(dt);
}

function addMonthsYMD(ymd: string, months: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);

  const originalDay = dt.getDate();
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + months);

  const lastDayOfTargetMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return toYMD(dt);
}

function endOfMonthYMD(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(y, m ?? 1, 0);
  return toYMD(dt);
}

function isBinDueByFrequency(
  lastDoneYMD: string | null,
  frequencyMonths: number | null,
  candidateCleaningDateYMD: string
) {
  if (!lastDoneYMD) return true;

  const freq = Math.max(1, Number(frequencyMonths ?? 1));
  const nextAllowedYMD = addMonthsYMD(lastDoneYMD, freq);

  return candidateCleaningDateYMD >= nextAllowedYMD;
}

function counterBadgeStyle(count: number): React.CSSProperties {
  if (count <= 1) {
    return {
      border: "1px solid #ff4d4f",
      background: "rgba(255,77,79,0.10)",
      color: "#ffd6d6",
    };
  }

  if (count === 2) {
    return {
      border: "1px solid #f1c40f",
      background: "rgba(241,196,15,0.10)",
      color: "#fff0b3",
    };
  }

  return {
    border: "1px solid #2ecc71",
    background: "rgba(46,204,113,0.10)",
    color: "#dff7e8",
  };
}

const nextDateBadgeStyle: React.CSSProperties = {
  border: "1px solid #2ecc71",
  background: "rgba(46,204,113,0.10)",
  color: "#dff7e8",
};

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

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function routeDistanceKm(route: RouteStop[], hq: { lat: number; lng: number }) {
  if (route.length === 0) return 0;

  let total = 0;

  total += distanceKm(hq.lat, hq.lng, route[0].customer!.lat!, route[0].customer!.lng!);

  for (let i = 0; i < route.length - 1; i++) {
    total += distanceKm(
      route[i].customer!.lat!,
      route[i].customer!.lng!,
      route[i + 1].customer!.lat!,
      route[i + 1].customer!.lng!
    );
  }

  total += distanceKm(
    route[route.length - 1].customer!.lat!,
    route[route.length - 1].customer!.lng!,
    hq.lat,
    hq.lng
  );

  return total;
}

function estimateDriveMinutes(distanceKmTotal: number) {
  const averageSpeedKmH = 45;
  return Math.round((distanceKmTotal / averageSpeedKmH) * 60);
}

function formatDriveTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} t` : `${h} t ${m} min`;
}

function twoOpt(route: RouteStop[], hq: { lat: number; lng: number }) {
  if (route.length < 4) return route;

  let best = [...route];
  let improved = true;

  while (improved) {
    improved = false;

    for (let i = 0; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];

        if (routeDistanceKm(candidate, hq) + 0.001 < routeDistanceKm(best, hq)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }

  return best;
}

function openGoogleMapsRoute(points: { lat: number; lng: number; label?: string }[]) {
  const usable = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (usable.length < 1) {
    alert("Vælg mindst 1 kunde med koordinater for at lave en rute.");
    return;
  }

  const HQ = "55.10692093390334,14.822756898314669";
  const origin = HQ;
  const destination = HQ;

  const waypoints = usable.map((p) => `${p.lat},${p.lng}`).join("|");
  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "") +
    `&travelmode=driving`;

  window.open(url, "_blank", "noopener,noreferrer");
}

function openSmsToCustomer(customer: Customer) {
  const rawPhone = customer.phone?.trim();

  if (!rawPhone) {
    alert("Denne kunde mangler telefonnummer.");
    return;
  }

  const cleanPhone = rawPhone.replace(/\s+/g, "");

  const message =
    "Hej, vær obs på at vi i morgen kommer og renser din/dine skraldespand(e). Undgå gerne at smide affald i den/dem inden. Mvh RenSpand Bornholm 🧼";

  const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;

  window.location.href = smsUrl;
}

function overviewCardStyle(tone: "green" | "blue" | "emerald" | "orange"): React.CSSProperties {
  if (tone === "green") {
    return {
      border: "1px solid rgba(46,204,113,0.55)",
      background: "radial-gradient(circle at top left, rgba(46,204,113,0.18), rgba(46,204,113,0.06) 45%, rgba(10,10,10,0.95) 100%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(46,204,113,0.05)",
    };
  }

  if (tone === "blue") {
    return {
      border: "1px solid rgba(78,161,255,0.55)",
      background: "radial-gradient(circle at top left, rgba(78,161,255,0.18), rgba(78,161,255,0.06) 45%, rgba(10,10,10,0.95) 100%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(78,161,255,0.05)",
    };
  }

  if (tone === "emerald") {
    return {
      border: "1px solid rgba(39,194,107,0.55)",
      background: "radial-gradient(circle at top left, rgba(39,194,107,0.18), rgba(39,194,107,0.06) 45%, rgba(10,10,10,0.95) 100%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(39,194,107,0.05)",
    };
  }

  return {
    border: "1px solid rgba(255,140,90,0.55)",
    background: "radial-gradient(circle at top left, rgba(255,140,90,0.18), rgba(255,140,90,0.06) 45%, rgba(10,10,10,0.95) 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(255,140,90,0.05)",
  };
}

function upcomingRouteStyle(row: UpcomingRouteRow, isActive: boolean): React.CSSProperties {
  if (isActive) {
    return {
      border: "1px solid #4ea1ff",
      background: "rgba(78,161,255,0.12)",
      color: "#dbeeff",
    };
  }

  if (row.stopCount === 0) {
    return {
      border: "1px solid #444",
      background: "#111",
      color: "#cfcfcf",
    };
  }

  if (row.doneCount === row.stopCount) {
    return {
      border: "1px solid #2ecc71",
      background: "rgba(46,204,113,0.10)",
      color: "#dff7e8",
    };
  }

  if (row.doneCount > 0 || row.skippedCount > 0) {
    return {
      border: "1px solid #f1c40f",
      background: "rgba(241,196,15,0.10)",
      color: "#fff0b3",
    };
  }

  return {
    border: "1px solid #4ea1ff",
    background: "rgba(78,161,255,0.08)",
    color: "#dbeeff",
  };
}

export default function KortPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const initialDate = searchParams.get("date") || toYMD(new Date());
  const [routeDate, setRouteDate] = useState<string>(initialDate);
  const [routeDay, setRouteDay] = useState<RouteDay | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [upcomingRoutes, setUpcomingRoutes] = useState<UpcomingRouteRow[]>([]);
  const [upcomingBaseDate, setUpcomingBaseDate] = useState<string>(initialDate);

  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("date", routeDate);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [routeDate, pathname, router, searchParams]);

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const [todayBinsByCustomer, setTodayBinsByCustomer] = useState<Record<string, string[]>>({});
  const [binOpportunityByCustomerBin, setBinOpportunityByCustomerBin] = useState<
    Record<string, BinOpportunityInfo>
  >({});

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const [mapsReady, setMapsReady] = useState(false);

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

  const routeStats = useMemo(() => {
    const HQ = {
      lat: 55.10692093390334,
      lng: 14.822756898314669,
    };

    const sortedStops = [...stops].sort((a, b) => a.order_index - b.order_index);

    const stopsWithCoords = sortedStops.filter(
      (s) =>
        s.customer?.lat != null &&
        s.customer?.lng != null &&
        Number.isFinite(s.customer.lat) &&
        Number.isFinite(s.customer.lng)
    );

    const totalKm = routeDistanceKm(stopsWithCoords, HQ);
    const driveMinutes = estimateDriveMinutes(totalKm);

    return {
      stopCount: sortedStops.length,
      routedStopCount: stopsWithCoords.length,
      totalKm,
      driveMinutes,
    };
  }, [stops]);

  const dayOverview = useMemo(() => {
    const total = stops.length;
    const done = stops.filter((s) => s.status === "done").length;
    const skipped = stops.filter((s) => s.status === "skipped").length;
    const remaining = stops.filter((s) => s.status === "planned").length;

    return {
      total,
      done,
      skipped,
      remaining,
      km: routeStats.totalKm,
      minutes: routeStats.driveMinutes,
    };
  }, [stops, routeStats.totalKm, routeStats.driveMinutes]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.push("/login");
    })();
  }, [router]);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,address,city,lat,lng,phone,email")
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
      .select("id,route_day_id,customer_id,order_index,status,done_at,note,planned_bin_types")
      .eq("route_day_id", routeDayId)
      .order("order_index", { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as RouteStop[];
    const customerMap = new Map(allCustomers.map((c) => [c.id, c]));

    const withCustomers = rows
      .map((r) => ({
        ...r,
        planned_bin_types: Array.isArray(r.planned_bin_types) ? r.planned_bin_types : [],
        customer: customerMap.get(r.customer_id),
      }))
      .sort((a, b) => a.order_index - b.order_index)
      .map((r, idx) => ({
        ...r,
        order_index: idx,
      }));

    setStops(withCustomers);
  }

  async function loadUpcomingRoutes(baseDateYMD: string) {
    const dates = Array.from({ length: 7 }, (_, i) => addDaysYMD(baseDateYMD, i));

    const fromDate = dates[0];
    const toDate = dates[dates.length - 1];

    const { data: routeDays, error: rdErr } = await supabase
      .from("route_days")
      .select("id,route_date")
      .gte("route_date", fromDate)
      .lte("route_date", toDate)
      .order("route_date", { ascending: true });

    if (rdErr) throw rdErr;

    const dayRows = (routeDays ?? []) as Array<{ id: string; route_date: string }>;
    const dayIds = dayRows.map((d) => d.id);

    const stopsByDayId: Record<string, RouteStop["status"][]> = {};

    if (dayIds.length > 0) {
      const { data: stopRows, error: rsErr } = await supabase
        .from("route_stops")
        .select("route_day_id,status")
        .in("route_day_id", dayIds);

      if (rsErr) throw rsErr;

      for (const row of (stopRows ?? []) as Array<{ route_day_id: string; status: RouteStop["status"] }>) {
        (stopsByDayId[row.route_day_id] ||= []).push(row.status);
      }
    }

    const rows: UpcomingRouteRow[] = dates.map((date) => {
      const day = dayRows.find((d) => d.route_date === date);
      const statuses = day ? stopsByDayId[day.id] ?? [] : [];

      const stopCount = statuses.length;
      const doneCount = statuses.filter((s) => s === "done").length;
      const skippedCount = statuses.filter((s) => s === "skipped").length;
      const plannedCount = statuses.filter((s) => s === "planned").length;

      return {
        date,
        stopCount,
        doneCount,
        skippedCount,
        plannedCount,
      };
    });

    setUpcomingRoutes(rows);
  }

  async function loadBinOpportunityData(dateYMD: string, customerIds: string[]) {
    if (!customerIds.length) {
      setTodayBinsByCustomer({});
      setBinOpportunityByCustomerBin({});
      return;
    }

    const uniqueCustomerIds = Array.from(new Set(customerIds));
    const monthStart = `${dateYMD.slice(0, 7)}-01`;
    const monthEnd = endOfMonthYMD(dateYMD);
    const pickupDateForToday = addDaysYMD(dateYMD, -1);

    const pickupWindowStart = addDaysYMD(monthStart, -1);
    const futureHorizonDate = addMonthsYMD(dateYMD, 12);
    const pickupWindowEnd = addDaysYMD(futureHorizonDate, -1);

    const { data: binConfigRows, error: binConfigErr } = await supabase
      .from("customer_bins")
      .select("customer_id,bin_type,is_active,frequency_months")
      .in("customer_id", uniqueCustomerIds)
      .eq("is_active", true);

    if (binConfigErr) throw binConfigErr;

    const activeBinConfigMap: Record<string, { frequency_months: number | null }> = {};
    const activeBinTypesByCustomer: Record<string, string[]> = {};

    for (const row of (binConfigRows ?? []) as ActiveBinConfigRow[]) {
      const key = `${row.customer_id}__${row.bin_type}`;
      activeBinConfigMap[key] = {
        frequency_months: row.frequency_months,
      };

      (activeBinTypesByCustomer[row.customer_id] ||= []);
      if (!activeBinTypesByCustomer[row.customer_id].includes(row.bin_type)) {
        activeBinTypesByCustomer[row.customer_id].push(row.bin_type);
      }
    }

    const { data: pickupData, error: pickupErr } = await supabase
      .from("bofa_pickups")
      .select("customer_id,bin_type,pickup_date")
      .in("customer_id", uniqueCustomerIds)
      .gte("pickup_date", pickupWindowStart)
      .lte("pickup_date", pickupWindowEnd)
      .order("pickup_date", { ascending: true });

    if (pickupErr) throw pickupErr;

    const pickupRows = (pickupData ?? []) as PickupRow[];

    const candidateBinTypes = Array.from(new Set(pickupRows.map((r) => r.bin_type)));

    const latestDoneByCustomerBin: Record<string, string | null> = {};

    if (candidateBinTypes.length > 0) {
      const { data: historyRows, error: historyErr } = await supabase
        .from("service_history")
        .select("customer_id,bin_type,serviced_at")
        .in("customer_id", uniqueCustomerIds)
        .in("bin_type", candidateBinTypes)
        .eq("status", "done")
        .order("serviced_at", { ascending: false });

      if (historyErr) throw historyErr;

      for (const row of (historyRows ?? []) as ServiceHistoryMiniRow[]) {
        const key = `${row.customer_id}__${row.bin_type}`;
        if (latestDoneByCustomerBin[key] === undefined) {
          latestDoneByCustomerBin[key] = row.serviced_at.slice(0, 10);
        }
      }
    }

    const cleaningDatesByKey: Record<string, string[]> = {};

    for (const row of pickupRows) {
      const key = `${row.customer_id}__${row.bin_type}`;
      if (!activeBinConfigMap[key]) continue;

      const cleaningDate = addDaysYMD(row.pickup_date, 1);
      (cleaningDatesByKey[key] ||= []).push(cleaningDate);
    }

    const todayMap: Record<string, string[]> = {};
    const infoMap: Record<string, BinOpportunityInfo> = {};

    for (const [key, cleaningDatesRaw] of Object.entries(cleaningDatesByKey)) {
      const [customerId, binType] = key.split("__");
      const config = activeBinConfigMap[key];
      if (!customerId || !binType || !config) continue;

      const lastDoneYMD = latestDoneByCustomerBin[key] ?? null;
      const uniqueCleaningDates = Array.from(new Set(cleaningDatesRaw)).sort();

      const dueCleaningDates = uniqueCleaningDates.filter((candidateDate) =>
        isBinDueByFrequency(lastDoneYMD, config.frequency_months, candidateDate)
      );

      const remainingCount = dueCleaningDates.filter(
        (d) => d.startsWith(dateYMD.slice(0, 7)) && d >= dateYMD
      ).length;

      const nextDate = dueCleaningDates.find((d) => d > dateYMD) ?? null;

      infoMap[key] = {
        remainingCount,
        nextDate,
      };

      const todayCleaningDate = addDaysYMD(pickupDateForToday, 1);
      const isDueToday = dueCleaningDates.includes(todayCleaningDate);

      if (isDueToday) {
        (todayMap[customerId] ||= []);
        if (!todayMap[customerId].includes(binType)) {
          todayMap[customerId].push(binType);
        }
      }
    }

    setTodayBinsByCustomer(todayMap);
    setBinOpportunityByCustomerBin(infoMap);
  }

  async function refreshBinOpportunityForCurrentStops() {
    const ids = Array.from(new Set(stops.map((s) => s.customer_id).filter(Boolean)));
    await loadBinOpportunityData(routeDate, ids);
  }

  async function persistStopOrder(orderedStops: RouteStop[]) {
    const normalized = orderedStops.map((stop, index) => ({
      ...stop,
      order_index: index,
    }));

    for (const stop of normalized) {
      const { error } = await supabase
        .from("route_stops")
        .update({ order_index: stop.order_index })
        .eq("id", stop.id);

      if (error) throw error;
    }

    setStops(normalized);
    await loadUpcomingRoutes(upcomingBaseDate);
  }

  async function reindexCurrentStops(nextStops: RouteStop[]) {
    const normalized = [...nextStops]
      .sort((a, b) => a.order_index - b.order_index)
      .map((stop, index) => ({
        ...stop,
        order_index: index,
      }));

    await persistStopOrder(normalized);
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
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        if (allCustomers.length === 0) return;
        const rd = await loadOrCreateRouteDay(routeDate);
        await loadStops(rd.id);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [routeDate, allCustomers.length]);

  useEffect(() => {
    (async () => {
      try {
        if (allCustomers.length === 0) return;
        await loadUpcomingRoutes(upcomingBaseDate);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [upcomingBaseDate, allCustomers.length]);

  useEffect(() => {
    (async () => {
      try {
        const ids = Array.from(new Set(stops.map((s) => s.customer_id).filter(Boolean)));
        await loadBinOpportunityData(routeDate, ids);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [routeDate, stops]);

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

  useEffect(() => {
    const g = (window as any).google as typeof google | undefined;
    const map = mapRef.current;
    if (!g?.maps || !map) return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];

    const bounds = new g.maps.LatLngBounds();
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
              <div style="font-weight:900;margin-bottom:6px;">Klar til rengøring (${routeDate})</div>
              ${todayBins
                .map((bt) => {
                  const key = `${c.id}__${bt}`;
                  const info = binOpportunityByCustomerBin[key];

                  let counterHtml = "";
                  if (s.status === "done") {
                    counterHtml = info?.nextDate
                      ? `<div style="margin-top:6px;font-size:12px;font-weight:900;color:#15803d;">Næste: ${info.nextDate}</div>`
                      : `<div style="margin-top:6px;font-size:12px;font-weight:900;color:#15803d;">Ingen ny dato endnu</div>`;
                  } else if (info?.remainingCount) {
                    const bg =
                      info.remainingCount <= 1
                        ? "rgba(255,77,79,0.10)"
                        : info.remainingCount === 2
                        ? "rgba(241,196,15,0.10)"
                        : "rgba(46,204,113,0.10)";
                    const border =
                      info.remainingCount <= 1 ? "#ff4d4f" : info.remainingCount === 2 ? "#f1c40f" : "#2ecc71";
                    const color =
                      info.remainingCount <= 1 ? "#b91c1c" : info.remainingCount === 2 ? "#a16207" : "#15803d";

                    counterHtml = `
                      <div style="margin-top:6px;">
                        <span style="display:inline-block;padding:4px 8px;border-radius:999px;border:1px solid ${border};background:${bg};font-size:12px;font-weight:900;color:${color};">
                          ${info.remainingCount} forsøg tilbage
                        </span>
                      </div>
                    `;
                  }

                  return `
                    <div style="border:1px solid #e6e6e6;border-radius:10px;padding:7px 10px;margin-top:6px;">
                      <div style="font-weight:900;">${binIconShort(bt)} ${binLabelShort(bt)}</div>
                      ${counterHtml}
                    </div>
                  `;
                })
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
          .select("customer_id,bin_type,pickup_day,week_group,frequency_months,is_active")
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
                const activeText = r.is_active === false ? "I bero" : "Aktiv";
                return `
                  <div style="border:1px solid #e6e6e6;border-radius:10px;padding:8px 10px;margin-top:8px;">
                    <div style="font-weight:900;">${binTypeLabel(r.bin_type)}</div>
                    <div style="font-size:13px;opacity:.9;margin-top:2px;">
                      Dag: <b>${day}</b> • Uger: <b>${wg}</b> • Frekvens: <b>${freq}</b> • Status: <b>${activeText}</b>
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

    if (markersRef.current.length > 0) {
      map.fitBounds(bounds, 60);
    } else {
      map.setCenter(HQ_POS);
      map.setZoom(12);
    }
  }, [stops, todayBinsByCustomer, binOpportunityByCustomerBin, routeDate, mapsReady]);

  async function addCustomerToRoute(customerId: string) {
    if (!routeDay) return;
    const exists = stops.some((s) => s.customer_id === customerId);
    if (exists) return;

    const nextIndex = stops.length;
    const plannedBins = todayBinsByCustomer[customerId] ?? [];

    const { data, error } = await supabase
      .from("route_stops")
      .insert({
        route_day_id: routeDay.id,
        customer_id: customerId,
        order_index: nextIndex,
        status: "planned",
        planned_bin_types: plannedBins,
      })
      .select("id,route_day_id,customer_id,order_index,status,done_at,note,planned_bin_types")
      .single();

    if (error) throw error;

    const customer = allCustomers.find((c) => c.id === customerId);
    setStops((prev) => [...prev, { ...(data as RouteStop), customer }]);
    await loadUpcomingRoutes(upcomingBaseDate);
  }

  async function updateStop(id: string, patch: Partial<RouteStop>) {
    const { error } = await supabase.from("route_stops").update(patch).eq("id", id);
    if (error) throw error;
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await loadUpcomingRoutes(upcomingBaseDate);
  }

  async function deactivateSingleCustomerPlannedBins(stop: RouteStop) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id,service_type")
      .eq("id", stop.customer_id)
      .single();

    if (customerError) throw customerError;
    if (!customer) return;

    if ((customer as any).service_type !== "single") return;

    const plannedBins = Array.isArray(stop.planned_bin_types)
      ? stop.planned_bin_types.filter(Boolean)
      : [];

    if (plannedBins.length === 0) return;

    const { error: updateError } = await supabase
      .from("customer_bins")
      .update({ is_active: false })
      .eq("customer_id", stop.customer_id)
      .in("bin_type", plannedBins);

    if (updateError) throw updateError;
  }

  async function writeServiceHistory(stop: RouteStop, status: "done" | "skipped") {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) throw userErr;
    if (!user) throw new Error("Ingen bruger logget ind");

    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Ukendt bruger";

    const plannedBins = Array.isArray(stop.planned_bin_types)
      ? stop.planned_bin_types.filter(Boolean)
      : [];

    if (plannedBins.length === 0) return;

    const rows = plannedBins.map((binType) => ({
      customer_id: stop.customer_id,
      route_stop_id: stop.id,
      bin_type: binType,
      status,
      serviced_at: new Date().toISOString(),
      note: stop.note ?? null,
      image_path: null,
      serviced_by_user_id: user.id,
      serviced_by_name: displayName,
    }));

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

    const nextStops = stops.filter((s) => s.id !== id);
    await reindexCurrentStops(nextStops);
  }

  async function moveStop(id: string, dir: -1 | 1) {
    const sorted = [...stops].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex((s) => s.id === id);
    const swapWith = idx + dir;

    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return;

    const moved = [...sorted];
    const [item] = moved.splice(idx, 1);
    moved.splice(swapWith, 0, item);

    await persistStopOrder(moved);
  }

  function buildDistanceMatrix(route: RouteStop[], hq: { lat: number; lng: number }) {
    const n = route.length;
    const points = route.map((s) => ({
      lat: s.customer!.lat!,
      lng: s.customer!.lng!,
    }));

    const hqToStop = points.map((p) => distanceKm(hq.lat, hq.lng, p.lat, p.lng));
    const stopToHq = points.map((p) => distanceKm(p.lat, p.lng, hq.lat, hq.lng));

    const between: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        between[i][j] = distanceKm(
          points[i].lat,
          points[i].lng,
          points[j].lat,
          points[j].lng
        );
      }
    }

    return { hqToStop, stopToHq, between };
  }

  function routeCostFromHQ(route: RouteStop[], hq: { lat: number; lng: number }) {
    if (route.length === 0) return 0;

    let total = 0;

    total += distanceKm(hq.lat, hq.lng, route[0].customer!.lat!, route[0].customer!.lng!);

    for (let i = 0; i < route.length - 1; i++) {
      total += distanceKm(
        route[i].customer!.lat!,
        route[i].customer!.lng!,
        route[i + 1].customer!.lat!,
        route[i + 1].customer!.lng!
      );
    }

    total += distanceKm(
      route[route.length - 1].customer!.lat!,
      route[route.length - 1].customer!.lng!,
      hq.lat,
      hq.lng
    );

    return total;
  }

  function pickBestDirection(route: RouteStop[], hq: { lat: number; lng: number }) {
    if (route.length <= 1) return route;

    const forward = [...route];
    const reversed = [...route].reverse();

    const forwardFirstDist = distanceKm(
      hq.lat,
      hq.lng,
      forward[0].customer!.lat!,
      forward[0].customer!.lng!
    );

    const reversedFirstDist = distanceKm(
      hq.lat,
      hq.lng,
      reversed[0].customer!.lat!,
      reversed[0].customer!.lng!
    );

    return forwardFirstDist <= reversedFirstDist ? forward : reversed;
  }

  function solveExactRoute(route: RouteStop[], hq: { lat: number; lng: number }) {
    const n = route.length;
    if (n <= 1) return [...route];

    const points = route.map((s) => ({
      lat: s.customer!.lat!,
      lng: s.customer!.lng!,
    }));

    const hqToStop = points.map((p) => distanceKm(hq.lat, hq.lng, p.lat, p.lng));
    const stopToHq = points.map((p) => distanceKm(p.lat, p.lng, hq.lat, hq.lng));

    const between: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const angleFromHq: number[] = points.map((p) =>
      Math.atan2(p.lat - hq.lat, p.lng - hq.lng)
    );

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        between[i][j] = distanceKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      }
    }

    function angularPenalty(a: number, b: number) {
      let diff = Math.abs(a - b);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      return diff;
    }

    const size = 1 << n;
    const dp: number[][] = Array.from({ length: size }, () => Array(n).fill(Infinity));
    const parent: number[][] = Array.from({ length: size }, () => Array(n).fill(-1));

    for (let i = 0; i < n; i++) {
      dp[1 << i][i] = hqToStop[i];
    }

    for (let mask = 0; mask < size; mask++) {
      for (let last = 0; last < n; last++) {
        const currentCost = dp[mask][last];
        if (!Number.isFinite(currentCost)) continue;
        if ((mask & (1 << last)) === 0) continue;

        for (let next = 0; next < n; next++) {
          if (mask & (1 << next)) continue;

          const nextMask = mask | (1 << next);
          const distCost = between[last][next];
          const turnPenalty = angularPenalty(angleFromHq[last], angleFromHq[next]) * 8;
          const nextCost = currentCost + distCost + turnPenalty;

          if (nextCost < dp[nextMask][next]) {
            dp[nextMask][next] = nextCost;
            parent[nextMask][next] = last;
          }
        }
      }
    }

    const fullMask = size - 1;
    let bestLast = 0;
    let bestTotal = Infinity;

    for (let last = 0; last < n; last++) {
      const total = dp[fullMask][last] + stopToHq[last];
      if (total < bestTotal) {
        bestTotal = total;
        bestLast = last;
      }
    }

    const order: number[] = [];
    let mask = fullMask;
    let current = bestLast;

    while (current !== -1) {
      order.push(current);
      const prev = parent[mask][current];
      mask = mask ^ (1 << current);
      current = prev;
    }

    order.reverse();

    const bestRoute = order.map((idx) => route[idx]);
    return pickBestDirection(bestRoute, hq);
  }

  function buildNearestNeighbourRoute(
    candidates: RouteStop[],
    startLat: number,
    startLng: number
  ) {
    const remaining = [...candidates];
    const route: RouteStop[] = [];

    let currentLat = startLat;
    let currentLng = startLng;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const stop = remaining[i];
        const lat = stop.customer!.lat!;
        const lng = stop.customer!.lng!;
        const dist = distanceKm(currentLat, currentLng, lat, lng);

        if (dist < bestDistance) {
          bestDistance = dist;
          bestIndex = i;
        }
      }

      const nextStop = remaining.splice(bestIndex, 1)[0];
      route.push(nextStop);
      currentLat = nextStop.customer!.lat!;
      currentLng = nextStop.customer!.lng!;
    }

    return route;
  }

  function solveHeuristicRoute(route: RouteStop[], hq: { lat: number; lng: number }) {
    if (route.length <= 1) return [...route];

    function angleFromHQ(stop: RouteStop) {
      return Math.atan2(stop.customer!.lat! - hq.lat, stop.customer!.lng! - hq.lng);
    }

    function normalizeAngleDiff(a: number, b: number) {
      let diff = Math.abs(a - b);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      return diff;
    }

    function routeCostWithPenalty(stops: RouteStop[]) {
      let total = 0;

      total += distanceKm(hq.lat, hq.lng, stops[0].customer!.lat!, stops[0].customer!.lng!);

      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];

        total += distanceKm(
          a.customer!.lat!,
          a.customer!.lng!,
          b.customer!.lat!,
          b.customer!.lng!
        );

        const anglePenalty = normalizeAngleDiff(angleFromHQ(a), angleFromHQ(b)) * 8;
        total += anglePenalty;
      }

      total += distanceKm(
        stops[stops.length - 1].customer!.lat!,
        stops[stops.length - 1].customer!.lng!,
        hq.lat,
        hq.lng
      );

      return total;
    }

    const byAngle = [...route].sort((a, b) => angleFromHQ(a) - angleFromHQ(b));
    const byAngleReverse = [...byAngle].reverse();
    const byDistance = [...route].sort((a, b) => {
      const da = distanceKm(hq.lat, hq.lng, a.customer!.lat!, a.customer!.lng!);
      const db = distanceKm(hq.lat, hq.lng, b.customer!.lat!, b.customer!.lng!);
      return da - db;
    });

    const candidates: RouteStop[][] = [
      byAngle,
      byAngleReverse,
      byDistance,
      buildNearestNeighbourRoute(route, hq.lat, hq.lng),
    ];

    for (const seed of route) {
      const seeded = [seed, ...route.filter((s) => s.id !== seed.id)];
      const built: RouteStop[] = [seed];
      const remaining = seeded.slice(1);

      let currentLat = seed.customer!.lat!;
      let currentLng = seed.customer!.lng!;

      while (remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = Infinity;

        for (let i = 0; i < remaining.length; i++) {
          const stop = remaining[i];
          const dist = distanceKm(currentLat, currentLng, stop.customer!.lat!, stop.customer!.lng!);

          const prevAngle = Math.atan2(currentLat - hq.lat, currentLng - hq.lng);
          const nextAngle = angleFromHQ(stop);
          const anglePenalty = normalizeAngleDiff(prevAngle, nextAngle) * 8;

          const score = dist + anglePenalty;

          if (score < bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }

        const nextStop = remaining.splice(bestIndex, 1)[0];
        built.push(nextStop);
        currentLat = nextStop.customer!.lat!;
        currentLng = nextStop.customer!.lng!;
      }

      candidates.push(built);
    }

    let bestRoute = candidates[0];
    let bestCost = routeCostWithPenalty(bestRoute);

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const cost = routeCostWithPenalty(candidate);

      if (cost < bestCost) {
        bestCost = cost;
        bestRoute = candidate;
      }
    }

    return pickBestDirection(bestRoute, hq);
  }

  async function optimizeRoute() {
    try {
      setError(null);
      setOptimizing(true);

      if (stops.length < 2) return;

      const HQ = {
        lat: 55.10692093390334,
        lng: 14.822756898314669,
      };

      const sortedStops = [...stops].sort((a, b) => a.order_index - b.order_index);

      const lockedStops = sortedStops.filter((s) => s.status !== "planned");
      const plannedStops = sortedStops.filter((s) => s.status === "planned");

      if (plannedStops.length < 2) return;

      const plannedWithCoords = plannedStops.filter(
        (s) =>
          s.customer?.lat != null &&
          s.customer?.lng != null &&
          Number.isFinite(s.customer.lat) &&
          Number.isFinite(s.customer.lng)
      );

      const plannedWithoutCoords = plannedStops.filter(
        (s) =>
          s.customer?.lat == null ||
          s.customer?.lng == null ||
          !Number.isFinite(s.customer.lat) ||
          !Number.isFinite(s.customer.lng)
      );

      if (plannedWithCoords.length < 2) return;

      const EXACT_LIMIT = 11;

      let bestPlannedRoute: RouteStop[];

      if (plannedWithCoords.length <= EXACT_LIMIT) {
        bestPlannedRoute = solveExactRoute(plannedWithCoords, HQ);
      } else {
        bestPlannedRoute = solveHeuristicRoute(plannedWithCoords, HQ);
      }

      const reorderedPlanned = [...bestPlannedRoute, ...plannedWithoutCoords];

      const finalStops = [...lockedStops, ...reorderedPlanned].map((stop, index) => ({
        ...stop,
        order_index: index,
      }));

      for (const stop of finalStops) {
        const { error } = await supabase
          .from("route_stops")
          .update({ order_index: stop.order_index })
          .eq("id", stop.id);

        if (error) throw error;
      }

      setStops(finalStops);
      await loadUpcomingRoutes(upcomingBaseDate);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setOptimizing(false);
    }
  }

  async function suggestCustomersForDate() {
    try {
      setError(null);
      const rd = routeDay ?? (await loadOrCreateRouteDay(routeDate));

      const selectedDateYMD =
        routeDate.split("-")[0]?.length === 4
          ? routeDate
          : routeDate.split("-").reverse().join("-");

      const pickupDateYMD = addDaysYMD(selectedDateYMD, -1);

      const { data: dateRows, error: dErr } = await supabase
        .from("bofa_pickups")
        .select("customer_id,bin_type,pickup_date")
        .eq("pickup_date", pickupDateYMD);

      if (dErr) throw dErr;

      const rows = (dateRows ?? []) as Array<{
        customer_id: string;
        bin_type: string;
        pickup_date: string;
      }>;

      if (rows.length === 0) {
        setTodayBinsByCustomer({});
        setError(`Rolig dag – ingen spande klar til rengøring (${pickupDateYMD}) for rutedato ${selectedDateYMD}.`);
        return;
      }

      const candidateCustomerIds = Array.from(new Set(rows.map((r) => r.customer_id)));
      const candidateBinTypes = Array.from(new Set(rows.map((r) => r.bin_type)));

      const { data: activeBinsRows, error: activeBinsErr } = await supabase
        .from("customer_bins")
        .select("customer_id,bin_type,is_active,frequency_months")
        .in("customer_id", candidateCustomerIds)
        .eq("is_active", true);

      if (activeBinsErr) throw activeBinsErr;

      const activeBinConfigMap: Record<string, { frequency_months: number | null }> = {};

      for (const row of (activeBinsRows ?? []) as ActiveBinConfigRow[]) {
        const key = `${row.customer_id}__${row.bin_type}`;
        activeBinConfigMap[key] = {
          frequency_months: row.frequency_months,
        };
      }

      const latestDoneByCustomerBin: Record<string, string | null> = {};

      if (candidateCustomerIds.length > 0 && candidateBinTypes.length > 0) {
        const { data: historyRows, error: historyErr } = await supabase
          .from("service_history")
          .select("customer_id,bin_type,serviced_at")
          .in("customer_id", candidateCustomerIds)
          .in("bin_type", candidateBinTypes)
          .eq("status", "done")
          .order("serviced_at", { ascending: false });

        if (historyErr) throw historyErr;

        for (const row of (historyRows ?? []) as ServiceHistoryMiniRow[]) {
          const key = `${row.customer_id}__${row.bin_type}`;
          if (latestDoneByCustomerBin[key] === undefined) {
            latestDoneByCustomerBin[key] = row.serviced_at.slice(0, 10);
          }
        }
      }

      const binsMap: Record<string, string[]> = {};

      for (const r of rows) {
        const key = `${r.customer_id}__${r.bin_type}`;
        const activeConfig = activeBinConfigMap[key];

        if (!activeConfig) continue;

        const lastDoneYMD = latestDoneByCustomerBin[key] ?? null;
        const isDueNow = isBinDueByFrequency(
          lastDoneYMD,
          activeConfig.frequency_months,
          selectedDateYMD
        );

        if (!isDueNow) continue;

        (binsMap[r.customer_id] ||= []);
        if (!binsMap[r.customer_id].includes(r.bin_type)) {
          binsMap[r.customer_id].push(r.bin_type);
        }
      }

      const eligibleIds = Object.keys(binsMap);

      if (eligibleIds.length === 0) {
        setTodayBinsByCustomer({});
        setError("Ingen aktive abonnementer/spande er forfaldne til rengøring på den valgte dag.");
        return;
      }

      setTodayBinsByCustomer(binsMap);
      setAdding(true);

      let nextIndex = stops.length;
      let addedAny = false;

      for (const cid of eligibleIds) {
        const plannedBins = binsMap[cid] ?? [];
        const existingStop = stops.find((s) => s.customer_id === cid);

        if (!existingStop) {
          const { data: inserted, error: insErr } = await supabase
            .from("route_stops")
            .insert({
              route_day_id: rd.id,
              customer_id: cid,
              order_index: nextIndex,
              status: "planned",
              planned_bin_types: plannedBins,
            })
            .select("id,route_day_id,customer_id,order_index,status,done_at,note,planned_bin_types")
            .single();

          if (insErr) throw insErr;

          const customer = allCustomers.find((c) => c.id === cid);
          setStops((prev) => [...prev, { ...(inserted as RouteStop), customer }]);

          nextIndex += 1;
          addedAny = true;
        } else {
          const { error: updErr } = await supabase
            .from("route_stops")
            .update({ planned_bin_types: plannedBins })
            .eq("id", existingStop.id);

          if (updErr) throw updErr;

          setStops((prev) =>
            prev.map((s) =>
              s.id === existingStop.id ? { ...s, planned_bin_types: plannedBins } : s
            )
          );
        }
      }

      if (addedAny) {
        await loadUpcomingRoutes(upcomingBaseDate);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setAdding(false);
    }
  }

  async function planDay() {
    try {
      setError(null);
      setPlanMessage(null);
      setAdding(true);

      const beforeCount = stops.length;

      await suggestCustomersForDate();
      await new Promise((r) => setTimeout(r, 150));
      await optimizeRoute();

      const afterCount = stops.length;
      const added = Math.max(0, afterCount - beforeCount);

      setPlanMessage(
        added > 0
          ? `Rute planlagt • ${added} stop tilføjet • rute optimeret`
          : "Rute planlagt • ingen nye stop • rute optimeret"
      );

      setTimeout(() => {
        setPlanMessage(null);
      }, 3500);
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

  const todayYMD = toYMD(new Date());
  const tomorrowYMD = addDaysYMD(todayYMD, 1);
  const BOTTOM_NAV_H = 76;

  return (
    <div style={{ padding: 24, color: "#ddd", paddingBottom: 24 + BOTTOM_NAV_H }}>
      {apiKey ? (
        <Script
          src={scriptSrc}
          strategy="afterInteractive"
          onLoad={() => {
            setTimeout(() => {
              if ((window as any).google?.maps) {
                setMapsReady(true);
                setError(null);
              } else {
                setError("Google script loaded, men google.maps mangler.");
              }
            }, 300);
          }}
          onError={() => setError("Kunne ikke loade Google Maps script (netværk/adblock).")}
        />
      ) : null}

      <AppHeader title="RenSpand Ruter" subtitle={`Kort · ${routeDate.split("-").reverse().join("-")}`} />

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

      {planMessage && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #2ecc71",
            background: "rgba(46,204,113,0.10)",
            color: "#dff7e8",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          {planMessage}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "auto auto auto 1fr minmax(320px, 420px)",
          gap: 12,
          alignItems: "end",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Dato:</span>
          <input
            id="routeDate"
            name="routeDate"
            type="date"
            value={routeDate}
            onChange={(e) => setRouteDate(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#111",
              color: "#fff",
              minHeight: 46,
            }}
          />
        </label>

        <button
          onClick={planDay}
          disabled={adding || optimizing}
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            background: adding || optimizing ? "#1d2a22" : "#1f8f52",
            border: "1px solid #2ecc71",
            color: "#f3fff8",
            cursor: adding || optimizing ? "not-allowed" : "pointer",
            fontWeight: 900,
            fontSize: 14,
            minHeight: 46,
            width: isMobile ? "100%" : undefined,
          }}
        >
          {adding || optimizing ? "Planlægger…" : "Planlæg dagen"}
        </button>

        {!isMobile ? (
          <button
            onClick={() => openGoogleMapsRoute(selectedPoints)}
            disabled={selectedPoints.length < 1}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              background: selectedPoints.length < 1 ? "#161616" : "#151515",
              border: "1px solid #3a3a3a",
              color: "#fff",
              cursor: selectedPoints.length < 1 ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontSize: 14,
              minHeight: 46,
            }}
          >
            Åbn rute (fra HQ)
          </button>
        ) : null}

        {!isMobile ? (
          <button
            onClick={() => router.push(`/kort/naeste?date=${encodeURIComponent(routeDate)}`)}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              background: "#151515",
              border: "1px solid #3a3a3a",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
              fontSize: 14,
              minHeight: 46,
            }}
          >
            Næste stop (app)
          </button>
        ) : null}

        <div style={{ minWidth: 0 }}>
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
              minHeight: 46,
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

        {isMobile ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              onClick={() => openGoogleMapsRoute(selectedPoints)}
              disabled={selectedPoints.length < 1}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                background: selectedPoints.length < 1 ? "#161616" : "#151515",
                border: "1px solid #3a3a3a",
                color: "#fff",
                cursor: selectedPoints.length < 1 ? "not-allowed" : "pointer",
                fontWeight: 900,
                fontSize: 14,
                minHeight: 46,
              }}
            >
              Åbn rute
            </button>

            <button
              onClick={() => router.push(`/kort/naeste?date=${encodeURIComponent(routeDate)}`)}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                background: "#151515",
                border: "1px solid #3a3a3a",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 14,
                minHeight: 46,
              }}
            >
              Næste stop
            </button>
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 420px) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div
          style={{
            order: isMobile ? 2 : 1,
            background: "#0d0d0d",
            border: "1px solid #222",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>Dagens overblik</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr",
              gap: 12,
            }}
          >
            <div
              style={{
                ...overviewCardStyle("green"),
                borderRadius: 18,
                padding: isMobile ? 14 : 16,
              }}
            >
              <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, opacity: 0.95 }}>🟢 Stop i alt</div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 42 : 46, fontWeight: 900, lineHeight: 1 }}>
                {dayOverview.total}
              </div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 14 : 15, fontWeight: 700, opacity: 0.9 }}>
                {dayOverview.km.toFixed(1)} km
              </div>
            </div>

            <div
              style={{
                ...overviewCardStyle("blue"),
                borderRadius: 18,
                padding: isMobile ? 14 : 16,
              }}
            >
              <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, opacity: 0.95 }}>🔵 Tilbage</div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 42 : 46, fontWeight: 900, lineHeight: 1 }}>
                {dayOverview.remaining}
              </div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 14 : 15, fontWeight: 700, opacity: 0.9 }}>
                Est. {formatDriveTime(dayOverview.minutes)}
              </div>
            </div>

            <div
              style={{
                ...overviewCardStyle("emerald"),
                borderRadius: 18,
                padding: isMobile ? 14 : 16,
              }}
            >
              <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, opacity: 0.95 }}>✅ Rengjort</div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 42 : 46, fontWeight: 900, lineHeight: 1 }}>
                {dayOverview.done}
              </div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 14 : 15, fontWeight: 700, opacity: 0.9 }}>
                Færdige stop
              </div>
            </div>

            <div
              style={{
                ...overviewCardStyle("orange"),
                borderRadius: 18,
                padding: isMobile ? 14 : 16,
              }}
            >
              <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, opacity: 0.95 }}>⚠️ Ikke muligt</div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 42 : 46, fontWeight: 900, lineHeight: 1 }}>
                {dayOverview.skipped}
              </div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 14 : 15, fontWeight: 700, opacity: 0.9 }}>
                Uafsluttede
              </div>
            </div>
          </div>

          {!isMobile ? (
            <>
              <div style={{ marginTop: 18, fontWeight: 900, fontSize: 18 }}>Dagens rute</div>

              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedStops.length === 0 && <div style={{ opacity: 0.8 }}>Ingen stop endnu.</div>}

                {sortedStops.map((s, i) => {
                  const c = s.customer;
                  const statusColor = s.status === "done" ? "#2ecc71" : s.status === "skipped" ? "#ff4d4f" : "#999";
                  const todays =
                    Array.isArray(s.planned_bin_types) && s.planned_bin_types.length > 0
                      ? s.planned_bin_types
                      : todayBinsByCustomer[s.customer_id] ?? [];

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
                            onClick={() => moveStop(s.id, -1).catch((e) => setError(String(e?.message ?? e)))}
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
                            onClick={() => moveStop(s.id, 1).catch((e) => setError(String(e?.message ?? e)))}
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

                      {c?.phone ? (
                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.9 }}>
                            <b>Tlf:</b> {c.phone}
                          </span>

                          <button
                            onClick={() => openSmsToCustomer(c)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid #4ea1ff",
                              background: "#101010",
                              color: "#dbeeff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            📩 SMS
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
                          <b>Tlf:</b> mangler
                        </div>
                      )}

                      {todays.length ? (
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {todays.map((bt) => {
                            const key = `${s.customer_id}__${bt}`;
                            const info = binOpportunityByCustomerBin[key];

                            return (
                              <div
                                key={bt}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                }}
                              >
                                <span
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

                                {s.status === "done" ? (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "5px 10px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 900,
                                      ...nextDateBadgeStyle,
                                    }}
                                  >
                                    {info?.nextDate ? `Næste: ${info.nextDate}` : "Ingen ny dato endnu"}
                                  </span>
                                ) : info?.remainingCount ? (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "5px 10px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 900,
                                      ...counterBadgeStyle(info.remainingCount),
                                    }}
                                  >
                                    {info.remainingCount} forsøg tilbage
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {s.note ? (
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.95 }}>
                          <b>Note:</b> {s.note}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          onClick={() => setStopNote(s.id).catch((e) => setError(String(e?.message ?? e)))}
                          style={{
                            padding: "8px 14px",
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
                              const updatedStop: RouteStop = { ...s, status: "done", done_at: doneAt };

                              await updateStop(s.id, { status: "done", done_at: doneAt });
                              await deactivateSingleCustomerPlannedBins(updatedStop);
                              await writeServiceHistory(updatedStop, "done");
                              await refreshBinOpportunityForCurrentStops();
                            } catch (e: any) {
                              setError(String(e?.message ?? e));
                            }
                          }}
                          style={{
                            padding: "8px 14px",
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
                              await refreshBinOpportunityForCurrentStops();
                            } catch (e: any) {
                              setError(String(e?.message ?? e));
                            }
                          }}
                          style={{
                            padding: "8px 14px",
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
                          onClick={() => updateStop(s.id, { status: "planned", done_at: null }).catch((e) => setError(String(e?.message ?? e)))}
                          style={{
                            padding: "8px 14px",
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
                          onClick={() => removeStop(s.id).catch((e) => setError(String(e?.message ?? e)))}
                          style={{
                            marginLeft: "auto",
                            padding: "8px 14px",
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
            </>
          ) : null}
        </div>

        <div
          style={{
            order: isMobile ? 1 : 2,
            background: "#0d0d0d",
            border: "1px solid #222",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div
            ref={mapDivRef}
            style={{
              height: isMobile ? 520 : 620,
              width: "100%",
              borderRadius: 16,
              overflow: "hidden",
              background: "#111",
            }}
          />

          {isMobile ? (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>Dagens rute</div>

              {sortedStops.length === 0 && <div style={{ opacity: 0.8 }}>Ingen stop endnu.</div>}

              {sortedStops.map((s, i) => {
                const c = s.customer;
                const statusColor = s.status === "done" ? "#2ecc71" : s.status === "skipped" ? "#ff4d4f" : "#999";
                const todays =
                  Array.isArray(s.planned_bin_types) && s.planned_bin_types.length > 0
                    ? s.planned_bin_types
                    : todayBinsByCustomer[s.customer_id] ?? [];

                return (
                  <div key={s.id} style={{ border: "1px solid #222", borderRadius: 14, padding: 12, background: "#0b0b0b" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {i + 1}. {c?.name ?? "(ukendt)"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: statusColor, fontWeight: 900 }}>
                          {s.status === "planned" ? "PLANLAGT" : s.status === "done" ? "RENGJORT" : "IKKE MULIGT"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => moveStop(s.id, -1).catch((e) => setError(String(e?.message ?? e)))}
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
                          onClick={() => moveStop(s.id, 1).catch((e) => setError(String(e?.message ?? e)))}
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

                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.82 }}>
                      {(c?.address ?? "").trim()} {c?.city ? `, ${c.city}` : ""}
                    </div>

                    {c?.phone ? (
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() => openSmsToCustomer(c)}
                          style={{
                            padding: "7px 10px",
                            borderRadius: 10,
                            border: "1px solid #4ea1ff",
                            background: "#101010",
                            color: "#dbeeff",
                            cursor: "pointer",
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          📩 SMS · {c.phone}
                        </button>
                      </div>
                    ) : null}

                    {todays.length ? (
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {todays.map((bt) => {
                          const key = `${s.customer_id}__${bt}`;
                          const info = binOpportunityByCustomerBin[key];

                          return (
                            <div key={bt} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <span
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

                              {s.status === "done" ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "5px 10px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 900,
                                    ...nextDateBadgeStyle,
                                  }}
                                >
                                  {info?.nextDate ? `Næste: ${info.nextDate}` : "Ingen ny dato endnu"}
                                </span>
                              ) : info?.remainingCount ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "5px 10px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 900,
                                    ...counterBadgeStyle(info.remainingCount),
                                  }}
                                >
                                  {info.remainingCount} forsøg tilbage
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {s.note ? (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.95 }}>
                        <b>Note:</b> {s.note}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button
                        onClick={() => setStopNote(s.id).catch((e) => setError(String(e?.message ?? e)))}
                        style={{
                          padding: "10px 12px",
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
                            const updatedStop: RouteStop = { ...s, status: "done", done_at: doneAt };

                            await updateStop(s.id, { status: "done", done_at: doneAt });
                            await deactivateSingleCustomerPlannedBins(updatedStop);
                            await writeServiceHistory(updatedStop, "done");
                            await refreshBinOpportunityForCurrentStops();
                          } catch (e: any) {
                            setError(String(e?.message ?? e));
                          }
                        }}
                        style={{
                          padding: "10px 12px",
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
                            await refreshBinOpportunityForCurrentStops();
                          } catch (e: any) {
                            setError(String(e?.message ?? e));
                          }
                        }}
                        style={{
                          padding: "10px 12px",
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
                        onClick={() => updateStop(s.id, { status: "planned", done_at: null }).catch((e) => setError(String(e?.message ?? e)))}
                        style={{
                          padding: "10px 12px",
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
                        onClick={() => removeStop(s.id).catch((e) => setError(String(e?.message ?? e)))}
                        style={{
                          gridColumn: "1 / -1",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #444",
                          background: "#101010",
                          color: "#fff",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Fjern stop
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          background: "#0d0d0d",
          border: "1px solid #222",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Kommende ruter</div>
            <div style={{ marginTop: 6, opacity: 0.8 }}>Næste 7 dage fra valgt oversigt</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setUpcomingBaseDate((prev) => addDaysYMD(prev, -1))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "#111",
                border: "1px solid #333",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                minWidth: 44,
              }}
              aria-label="Vis tidligere dage"
              title="Vis tidligere dage"
            >
              ←
            </button>

            <button
              onClick={() => setUpcomingBaseDate((prev) => addDaysYMD(prev, 1))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "#111",
                border: "1px solid #333",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                minWidth: 44,
              }}
              aria-label="Vis senere dage"
              title="Vis senere dage"
            >
              →
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {upcomingRoutes.map((row) => {
            const isActive = row.date === routeDate;

            return (
              <button
                key={row.date}
                onClick={() => setRouteDate(row.date)}
                style={{
                  textAlign: "left",
                  borderRadius: 14,
                  padding: 12,
                  cursor: "pointer",
                  fontWeight: 800,
                  ...upcomingRouteStyle(row, isActive),
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 900 }}>
                  {row.date === todayYMD
                    ? `I dag · ${toDMY(row.date)}`
                    : row.date === tomorrowYMD
                    ? `I morgen · ${toDMY(row.date)}`
                    : `Rute · ${toDMY(row.date)}`}
                </div>

                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95 }}>
                  {row.stopCount} stop
                </div>

                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                  {row.stopCount === 0
                    ? "Ingen planlagt rute endnu"
                    : row.doneCount === row.stopCount
                    ? "Alle stop er færdige"
                    : row.doneCount > 0 || row.skippedCount > 0
                    ? `${row.doneCount} rengjort • ${row.skippedCount} ikke muligt • ${row.plannedCount} planlagt`
                    : "Planlagt rute"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <NavTabs />
    </div>
  );
}