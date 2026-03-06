"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
};

type RouteStop = {
  id: string;
  route_day_id: string;
  customer_id: string;
  order_index: number;
  status: "planned" | "done" | "skipped";
  done_at: string | null;
  note: string | null;
  customer?: Customer;
};

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function customerAddr(c?: Customer | null) {
  if (!c) return "";
  return `${c.address ?? ""}${c.city ? ", " + c.city : ""}`.trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Åbner Google Maps i samme "app/tab".
 * - Har koordinater: navigation fra HQ -> kunden
 * - Ellers: maps search på adresse
 */
function openGoogleMapsToCustomer(c: Customer) {
  const hasCoords =
    Number.isFinite(c.lat ?? NaN) && Number.isFinite(c.lng ?? NaN);

  if (hasCoords) {
    const HQ = "55.10692093390334,14.822756898314669";
    const destination = `${c.lat},${c.lng}`;

    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${encodeURIComponent(HQ)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&travelmode=driving`;

    window.location.href = url;
    return;
  }

  const addr = customerAddr(c);
  if (!addr) return;

  const url =
    `https://www.google.com/maps/search/?api=1` +
    `&query=${encodeURIComponent(addr)}`;

  window.location.href = url;
}

export default function NaestePage() {
  const router = useRouter();
  const sp = useSearchParams();

  const routeDate = sp.get("date") || toYMD(new Date());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [routeDay, setRouteDay] = useState<RouteDay | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [idx, setIdx] = useState(0);

  // ✅ NYT: success overlay når man trykker Rengjort
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  // Auth check
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.push("/login");
    })();
  }, [router]);

  async function loadRouteForDate(dateStr: string) {
    const { data: rd, error: rdErr } = await supabase
      .from("route_days")
      .select("id,route_date")
      .eq("route_date", dateStr)
      .maybeSingle();

    if (rdErr) throw rdErr;

    if (!rd) {
      setRouteDay(null);
      setStops([]);
      setIdx(0);
      return;
    }

    const rdTyped = rd as RouteDay;
    setRouteDay(rdTyped);

    const { data: sRows, error: sErr } = await supabase
      .from("route_stops")
      .select("id,route_day_id,customer_id,order_index,status,done_at,note")
      .eq("route_day_id", rdTyped.id)
      .order("order_index", { ascending: true });

    if (sErr) throw sErr;

    const stopsRaw = (sRows ?? []) as RouteStop[];
    if (stopsRaw.length === 0) {
      setStops([]);
      setIdx(0);
      return;
    }

    const ids = Array.from(
      new Set(stopsRaw.map((s) => s.customer_id).filter(Boolean))
    );

    let cRows: Customer[] = [];
    if (ids.length > 0) {
      const { data, error: cErr } = await supabase
        .from("customers")
        .select("id,name,address,city,lat,lng")
        .in("id", ids);

      if (cErr) throw cErr;
      cRows = (data ?? []) as Customer[];
    }

    const cMap = new Map<string, Customer>(cRows.map((c) => [c.id, c]));

    const withCustomers: RouteStop[] = stopsRaw.map((s) => ({
      ...s,
      customer: cMap.get(s.customer_id),
    }));

    setStops(withCustomers);

    const firstPlanned = withCustomers.findIndex((s) => s.status === "planned");
    setIdx(firstPlanned >= 0 ? firstPlanned : 0);
  }

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

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadRouteForDate(routeDate);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDate]);

  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.order_index - b.order_index),
    [stops]
  );

  const current = sortedStops[idx] ?? null;

  const plannedCount = useMemo(
    () => sortedStops.filter((s) => s.status === "planned").length,
    [sortedStops]
  );

  function findNextPlannedIndex(fromIndex: number) {
    return sortedStops.findIndex(
      (s, i) => i > fromIndex && s.status === "planned"
    );
  }

  function jumpToFirstPlanned() {
    const i = sortedStops.findIndex((s) => s.status === "planned");
    if (i >= 0) setIdx(i);
  }

  async function updateStop(stopId: string, patch: Partial<RouteStop>) {
    const { error } = await supabase.from("route_stops").update(patch).eq("id", stopId);
    if (error) throw error;

    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? ({ ...s, ...patch } as RouteStop) : s))
    );
  }

  async function markAndGo(status: "done" | "skipped") {
    if (!current) return;

    try {
      setError(null);

      if (status === "done") {
        const doneAt = new Date().toISOString();

        await updateStop(current.id, {
          status: "done",
          done_at: doneAt,
        });

        await writeServiceHistory(
          { ...current, status: "done", done_at: doneAt },
          "done"
        );

        // ✅ Vis RenSpand overlay kort før næste kunde åbnes
        setShowSuccessOverlay(true);
        await sleep(1200);
        setShowSuccessOverlay(false);
      } else {
        await updateStop(current.id, { status: "skipped", done_at: null });

        await writeServiceHistory(
          { ...current, status: "skipped", done_at: null },
          "skipped"
        );
      }

      const nextPlanned = findNextPlannedIndex(idx);
      if (nextPlanned >= 0) {
        setIdx(nextPlanned);

        const next = sortedStops[nextPlanned];
        const c = next?.customer;
        if (c) openGoogleMapsToCustomer(c);
      }
    } catch (e: any) {
      setShowSuccessOverlay(false);
      setError(String(e?.message ?? e));
    }
  }

  if (loading) return <div style={{ padding: 24, color: "#ddd" }}>Indlæser…</div>;

  return (
    <div style={{ padding: 18, color: "#eee", maxWidth: 780, margin: "0 auto", position: "relative" }}>
      {showSuccessOverlay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "min(92vw, 360px)",
              borderRadius: 24,
              border: "1px solid #2a2a2a",
              background: "linear-gradient(180deg, rgba(18,18,18,0.98), rgba(10,10,10,0.98))",
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
              padding: "28px 22px",
              textAlign: "center",
            }}
          >
            <img
              src="/apple-touch-icon.png"
              alt="RenSpand logo"
              style={{
                width: 88,
                height: 88,
                objectFit: "cover",
                borderRadius: 22,
                border: "1px solid #2a2a2a",
                background: "#fff",
              }}
            />

            <div
              style={{
                width: 78,
                height: 78,
                margin: "18px auto 0",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(46,204,113,0.14)",
                border: "2px solid #2ecc71",
                color: "#2ecc71",
                fontSize: 42,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              ✓
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: 28,
                fontWeight: 900,
                color: "#fff",
                letterSpacing: 0.2,
              }}
            >
              Rengjort
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                color: "#dff7e8",
                opacity: 0.9,
              }}
            >
              RenSpand Bornholm
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>Næste stop</div>
          <div style={{ opacity: 0.85, marginTop: 4 }}>
            Dato: <b>{routeDate}</b> · Stops: <b>{sortedStops.length}</b> · PLAN: <b>{plannedCount}</b>
          </div>
        </div>

        <button
          onClick={() => router.push(`/kort?date=${encodeURIComponent(routeDate)}`)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          Tilbage
        </button>
      </div>

      {error && <div style={{ marginTop: 12, color: "#ff6b6b", fontWeight: 800 }}>{error}</div>}

      {!routeDay ? (
        <div style={{ marginTop: 18, opacity: 0.85 }}>
          Ingen rute fundet for datoen. Gå til <b>/kort</b> og tryk “Spande klar til rengøring”.
        </div>
      ) : sortedStops.length === 0 ? (
        <div style={{ marginTop: 18, opacity: 0.85 }}>Ruten har 0 stop.</div>
      ) : !current ? (
        <div style={{ marginTop: 18, opacity: 0.85 }}>Kunne ikke finde et stop.</div>
      ) : (
        <div style={{ marginTop: 16, border: "1px solid #222", borderRadius: 16, background: "#0d0d0d", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 260 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>
                {idx + 1}. {current.customer?.name ?? "(ukendt)"}
                <span style={{ marginLeft: 10, opacity: 0.8, fontWeight: 800 }}>
                  {current.status === "planned" ? "PLAN" : current.status === "done" ? "RENGJORT" : "IKKE MULIGT"}
                </span>
              </div>

              <div style={{ marginTop: 6, opacity: 0.85 }}>
                {customerAddr(current.customer)}
                {!current.customer?.lat || !current.customer?.lng ? " • (mangler koordinater)" : ""}
              </div>

              {current.note ? (
                <div style={{ marginTop: 8, opacity: 0.95 }}>
                  <b>Note:</b> {current.note}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
              <button
                onClick={() => {
                  const c = current.customer;
                  if (!c) return;
                  openGoogleMapsToCustomer(c);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #444",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Åbn i Maps
              </button>

              <button
                onClick={jumpToFirstPlanned}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2ecc71",
                  background: "#0f2a1b",
                  color: "#dff7e8",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Hop til næste PLAN
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => markAndGo("done")}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2ecc71",
                background: "#0f2a1b",
                color: "#dff7e8",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Rengjort
            </button>

            <button
              onClick={() => markAndGo("skipped")}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ff4d4f",
                background: "#2a0a0a",
                color: "#ffd6d6",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Ikke muligt
            </button>

            <button
              onClick={async () => {
                const currentNote = current.note ?? "";
                const txt = prompt("Skriv note:", currentNote);
                if (txt === null) return;
                try {
                  setError(null);
                  await updateStop(current.id, { note: txt });
                } catch (e: any) {
                  setError(String(e?.message ?? e));
                }
              }}
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

            <div style={{ flex: 1 }} />

            <button
              onClick={() => setIdx((v) => Math.max(0, v - 1))}
              disabled={idx === 0}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #333",
                background: "#111",
                color: "#fff",
                cursor: idx === 0 ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: idx === 0 ? 0.5 : 1,
              }}
            >
              ← Forrige
            </button>

            <button
              onClick={() => setIdx((v) => Math.min(sortedStops.length - 1, v + 1))}
              disabled={idx === sortedStops.length - 1}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #333",
                background: "#111",
                color: "#fff",
                cursor: idx === sortedStops.length - 1 ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: idx === sortedStops.length - 1 ? 0.5 : 1,
              }}
            >
              Næste →
            </button>
          </div>

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            Tip: Åbn denne side fra <b>/kort</b> så datoen følger med: <b>/kort/naeste?date=YYYY-MM-DD</b>
          </div>
        </div>
      )}
    </div>
  );
}