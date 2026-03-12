"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
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
  note_image_path: string | null;
  planned_bin_types: string[] | null;
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

function getPublicImageUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data } = supabase.storage.from("route-notes").getPublicUrl(path);
  return data.publicUrl;
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

  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [notePreviewUrl, setNotePreviewUrl] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      .select(
        "id,route_day_id,customer_id,order_index,status,done_at,note,note_image_path,planned_bin_types"
      )
      .eq("route_day_id", rdTyped.id)
      .order("order_index", { ascending: true });

    if (sErr) throw sErr;

    const stopsRaw = ((sRows ?? []) as RouteStop[]).map((s) => ({
      ...s,
      planned_bin_types: Array.isArray(s.planned_bin_types)
        ? s.planned_bin_types
        : [],
    }));

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
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) throw userErr;
    if (!user) throw new Error("Ingen bruger er logget ind.");

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
      image_path: stop.note_image_path ?? null,
      serviced_by_user_id: user.id,
      serviced_by_name: displayName,
    }));

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
  }, [routeDate]);

  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.order_index - b.order_index),
    [stops]
  );

  const current = sortedStops[idx] ?? null;

  const currentImageUrl = useMemo(
    () => getPublicImageUrl(current?.note_image_path),
    [current?.note_image_path]
  );

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

  function resetNoteEditor() {
    setIsNoteEditorOpen(false);
    setNoteDraft("");
    setNoteFile(null);
    setNotePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openNoteEditor() {
    if (!current) return;
    setNoteDraft(current.note ?? "");
    setNoteFile(null);
    setNotePreviewUrl(getPublicImageUrl(current.note_image_path));
    setIsNoteEditorOpen(true);
  }

  function onSelectNoteFile(file: File | null) {
    setNoteFile(file);
    if (!file) {
      setNotePreviewUrl(current ? getPublicImageUrl(current.note_image_path) : null);
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setNotePreviewUrl(localUrl);
  }

  async function updateStop(stopId: string, patch: Partial<RouteStop>) {
    const { error } = await supabase.from("route_stops").update(patch).eq("id", stopId);
    if (error) throw error;

    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? ({ ...s, ...patch } as RouteStop) : s))
    );
  }

  async function uploadNoteImage(stop: RouteStop, file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const filePath = `${routeDate}/${stop.id}-${Date.now()}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from("route-notes")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });

    if (uploadErr) throw uploadErr;
    return filePath;
  }

  async function saveNoteAndImage() {
    if (!current) return;

    try {
      setError(null);
      setSavingNote(true);

      let nextImagePath = current.note_image_path;

      if (noteFile) {
        nextImagePath = await uploadNoteImage(current, noteFile);
      }

      await updateStop(current.id, {
        note: noteDraft.trim() || null,
        note_image_path: nextImagePath ?? null,
      });

      resetNoteEditor();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSavingNote(false);
    }
  }

  async function removeNoteImageOnly() {
    if (!current) return;

    try {
      setError(null);
      setSavingNote(true);

      if (current.note_image_path) {
        await supabase.storage.from("route-notes").remove([current.note_image_path]);
      }

      await updateStop(current.id, {
        note_image_path: null,
      });

      setNoteFile(null);
      setNotePreviewUrl(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSavingNote(false);
    }
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
            Dato: <b>{routeDate.split("-").reverse().join("-")}</b> · Stops: <b>{sortedStops.length}</b> · PLAN: <b>{plannedCount}</b>
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
          Ingen rute fundet for datoen. Gå til <b>/kort</b> og tryk “Planlæg dagen”.
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

              {Array.isArray(current.planned_bin_types) && current.planned_bin_types.length > 0 ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {current.planned_bin_types.map((bin) => (
                    <span
                      key={bin}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid #333",
                        background: "#111",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {bin}
                    </span>
                  ))}
                </div>
              ) : null}

              {current.note ? (
                <div style={{ marginTop: 8, opacity: 0.95 }}>
                  <b>Note:</b> {current.note}
                </div>
              ) : null}

              {currentImageUrl ? (
                <div style={{ marginTop: 10 }}>
                  <img
                    src={currentImageUrl}
                    alt="Stop dokumentation"
                    style={{
                      width: "100%",
                      maxWidth: 320,
                      borderRadius: 14,
                      border: "1px solid #333",
                      display: "block",
                    }}
                  />
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
              onClick={openNoteEditor}
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
              Note + billede
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

          {isNoteEditorOpen && (
            <div
              style={{
                marginTop: 14,
                border: "1px solid #2a2a2a",
                borderRadius: 16,
                background: "#111",
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Dokumentér skade / note</div>

              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Skriv note, fx: låg revnet før rengøring..."
                rows={4}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #333",
                  background: "#0d0d0d",
                  color: "#fff",
                  outline: "none",
                }}
              />

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onSelectNoteFile(e.target.files?.[0] ?? null)}
                  style={{ display: "none" }}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #3a3a3a",
                    background: "#151515",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Tilføj / tag billede
                </button>

                {(current.note_image_path || noteFile) && (
                  <button
                    onClick={removeNoteImageOnly}
                    disabled={savingNote}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ff4d4f",
                      background: "#2a0a0a",
                      color: "#ffd6d6",
                      cursor: savingNote ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Fjern billede
                  </button>
                )}
              </div>

              {notePreviewUrl ? (
                <div style={{ marginTop: 12 }}>
                  <img
                    src={notePreviewUrl}
                    alt="Forhåndsvisning"
                    style={{
                      width: "100%",
                      maxWidth: 360,
                      borderRadius: 14,
                      border: "1px solid #333",
                      display: "block",
                    }}
                  />
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={saveNoteAndImage}
                  disabled={savingNote}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #2ecc71",
                    background: "#0f2a1b",
                    color: "#dff7e8",
                    cursor: savingNote ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  {savingNote ? "Gemmer..." : "Gem note + billede"}
                </button>

                <button
                  onClick={resetNoteEditor}
                  disabled={savingNote}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #333",
                    background: "#101010",
                    color: "#fff",
                    cursor: savingNote ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  Annuller
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            Tip: Åbn denne side fra <b>/kort</b> så datoen følger med: <b>/kort/naeste?date=YYYY-MM-DD</b>
          </div>
        </div>
      )}
    </div>
  );
}