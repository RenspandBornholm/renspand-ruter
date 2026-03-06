"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import NavTabs from "@/app/components/NavTabs";
import AppHeader from "@/app/components/AppHeader";

type ServiceType = "single" | "subscription";
type CustomerType = "private" | "business";
type BinType = "madaffald" | "rest_plast" | "pap_papir" | "metal_glas";
type Freq = 1 | 2 | 3 | 6;

type CustomerRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  service_type: ServiceType | null;
  customer_type: CustomerType | null;
  created_at?: string;
};

type BinRow = {
  id: string;
  customer_id: string;
  bin_type: BinType;
  pickup_day: string | null;
  week_group: string | null;
  frequency_months: number | null;
};

type PickupRow = {
  customer_id: string;
  bin_type: BinType;
  pickup_date: string;
};

type ServiceHistoryRow = {
  customer_id: string;
  bin_type: BinType;
  status: "done" | "skipped";
  serviced_at: string;
};

type BinOpportunityInfo = {
  remainingCount: number;
  nextDate: string | null;
};

const BIN_LABEL: Record<BinType, string> = {
  madaffald: "Madaffald",
  rest_plast: "Rest + plast",
  pap_papir: "Papir/pap",
  metal_glas: "Metal/glas",
};

const BIN_ICON: Record<BinType, string> = {
  madaffald: "🍎",
  rest_plast: "🗑️",
  pap_papir: "📦",
  metal_glas: "🍾",
};

const FREQS: Freq[] = [1, 2, 3, 6];

function formatYMDFromISO(iso: string) {
  return iso.slice(0, 10);
}

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

function endOfMonthYMD(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(y, m ?? 1, 0);
  return toYMD(dt);
}

function daysSince(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  const diffMs = now - t;
  const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return d >= 0 ? d : 0;
}

function doneBadgeStyle(days: number) {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #2b2b2b",
    background: "#111",
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.95,
  };

  if (days <= 7) return { ...base, border: "1px solid #2ecc71", background: "rgba(46,204,113,0.08)" };
  if (days <= 21) return { ...base, border: "1px solid #f1c40f", background: "rgba(241,196,15,0.08)" };
  return { ...base, border: "1px solid #ff4d4f", background: "rgba(255,77,79,0.08)" };
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

function parseBofaDatesToYMD(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];

  for (const l of lines) {
    const iso = l.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) {
      out.push(`${iso[1]}-${iso[2]}-${iso[3]}`);
      continue;
    }

    const dk = l.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
    if (dk) {
      const dd = String(dk[1]).padStart(2, "0");
      const mm = String(dk[2]).padStart(2, "0");
      const yyyy = dk[3];
      out.push(`${yyyy}-${mm}-${dd}`);
      continue;
    }
  }

  return Array.from(new Set(out)).sort();
}

export default function KunderPage() {
  const router = useRouter();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [serviceType, setServiceType] = useState<ServiceType>("single");
  const [customerType, setCustomerType] = useState<CustomerType>("private");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  const [selectedBins, setSelectedBins] = useState<Record<BinType, boolean>>({
    madaffald: false,
    rest_plast: false,
    pap_papir: false,
    metal_glas: false,
  });

  const [binSettings, setBinSettings] = useState<
    Record<
      BinType,
      {
        frequency_months: Freq;
      }
    >
  >({
    madaffald: { frequency_months: 1 },
    rest_plast: { frequency_months: 1 },
    pap_papir: { frequency_months: 1 },
    metal_glas: { frequency_months: 1 },
  });

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [binsByCustomer, setBinsByCustomer] = useState<Record<string, BinRow[]>>({});
  const [lastDoneByCustomer, setLastDoneByCustomer] = useState<Record<string, string | null>>({});
  const [nextPickupByCustomerBin, setNextPickupByCustomerBin] = useState<Record<string, string | null>>({});
  const [binOpportunityByCustomerBin, setBinOpportunityByCustomerBin] = useState<Record<string, BinOpportunityInfo>>({});
  const [doneThisCycleByCustomerBin, setDoneThisCycleByCustomerBin] = useState<Record<string, boolean>>({});

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chosenBinList = useMemo(
    () => (Object.keys(selectedBins) as BinType[]).filter((b) => selectedBins[b]),
    [selectedBins]
  );

  function toggleBin(bin: BinType) {
    setSelectedBins((prev) => ({ ...prev, [bin]: !prev[bin] }));
  }

  function updateBinSetting(bin: BinType, freq: Freq) {
    setBinSettings((prev) => ({
      ...prev,
      [bin]: { ...prev[bin], frequency_months: freq },
    }));
  }

  async function loadCustomers() {
    setError(null);

    const todayYMD = toYMD(new Date());
    const monthStart = `${todayYMD.slice(0, 7)}-01`;
    const monthEnd = endOfMonthYMD(todayYMD);
    const pickupWindowStart = addDaysYMD(monthStart, -1);
    const pickupWindowEnd = addDaysYMD(monthEnd, -1);

    const { data: cData, error: cErr } = await supabase
      .from("customers")
      .select("id,name,address,city,lat,lng,service_type,customer_type,created_at")
      .order("created_at", { ascending: false });

    if (cErr) {
      setError(cErr.message);
      return;
    }

    const rows = (cData ?? []) as CustomerRow[];
    setCustomers(rows);

    const ids = rows.map((r) => r.id);
    if (!ids.length) {
      setBinsByCustomer({});
      setLastDoneByCustomer({});
      setNextPickupByCustomerBin({});
      setBinOpportunityByCustomerBin({});
      setDoneThisCycleByCustomerBin({});
      return;
    }

    const { data: bData, error: bErr } = await supabase
      .from("customer_bins")
      .select("id,customer_id,bin_type,pickup_day,week_group,frequency_months")
      .in("customer_id", ids);

    if (bErr) {
      setError(bErr.message);
      setBinsByCustomer({});
      setLastDoneByCustomer({});
      setNextPickupByCustomerBin({});
      setBinOpportunityByCustomerBin({});
      setDoneThisCycleByCustomerBin({});
      return;
    }

    const map: Record<string, BinRow[]> = {};
    for (const b of (bData ?? []) as BinRow[]) {
      (map[b.customer_id] ||= []).push(b);
    }
    setBinsByCustomer(map);

    const { data: dData, error: dErr } = await supabase
      .from("route_stops")
      .select("customer_id,done_at,status")
      .in("customer_id", ids)
      .eq("status", "done")
      .order("done_at", { ascending: false });

    if (!dErr) {
      const doneMap: Record<string, string | null> = {};
      for (const row of (dData ?? []) as Array<{ customer_id: string; done_at: string | null }>) {
        if (doneMap[row.customer_id] === undefined) doneMap[row.customer_id] = row.done_at ?? null;
      }
      setLastDoneByCustomer(doneMap);
    } else {
      setLastDoneByCustomer({});
    }

    const { data: pData, error: pErr } = await supabase
      .from("bofa_pickups")
      .select("customer_id,bin_type,pickup_date")
      .in("customer_id", ids)
      .gte("pickup_date", todayYMD)
      .order("pickup_date", { ascending: true });

    if (!pErr) {
      const nextMap: Record<string, string | null> = {};
      for (const row of (pData ?? []) as Array<{ customer_id: string; bin_type: string; pickup_date: string }>) {
        const key = `${row.customer_id}__${row.bin_type}`;
        if (nextMap[key] === undefined) nextMap[key] = row.pickup_date;
      }
      setNextPickupByCustomerBin(nextMap);
    } else {
      setNextPickupByCustomerBin({});
    }

    const { data: monthPickupData, error: monthPickupErr } = await supabase
      .from("bofa_pickups")
      .select("customer_id,bin_type,pickup_date")
      .in("customer_id", ids)
      .gte("pickup_date", pickupWindowStart)
      .lte("pickup_date", pickupWindowEnd)
      .order("pickup_date", { ascending: true });

    if (monthPickupErr) {
      setBinOpportunityByCustomerBin({});
      setDoneThisCycleByCustomerBin({});
      return;
    }

    const pickupRows = (monthPickupData ?? []) as PickupRow[];

    const groupedPickups: Record<string, string[]> = {};
    for (const row of pickupRows) {
      const key = `${row.customer_id}__${row.bin_type}`;
      const cleaningDate = addDaysYMD(row.pickup_date, 1);

      if (!cleaningDate.startsWith(todayYMD.slice(0, 7))) continue;

      (groupedPickups[key] ||= []).push(cleaningDate);
    }

    const opportunityMap: Record<string, BinOpportunityInfo> = {};
    for (const [key, cleaningDatesRaw] of Object.entries(groupedPickups)) {
      const cleaningDates = Array.from(new Set(cleaningDatesRaw)).sort();
      const remainingCount = cleaningDates.filter((d) => d >= todayYMD).length;
      const nextDate = cleaningDates.find((d) => d > todayYMD) ?? null;

      opportunityMap[key] = {
        remainingCount,
        nextDate,
      };
    }
    setBinOpportunityByCustomerBin(opportunityMap);

    const { data: historyData, error: historyErr } = await supabase
      .from("service_history")
      .select("customer_id,bin_type,status,serviced_at")
      .in("customer_id", ids)
      .eq("status", "done")
      .gte("serviced_at", `${monthStart}T00:00:00`)
      .lte("serviced_at", `${monthEnd}T23:59:59`)
      .order("serviced_at", { ascending: false });

    if (historyErr) {
      setDoneThisCycleByCustomerBin({});
      return;
    }

    const historyRows = (historyData ?? []) as ServiceHistoryRow[];
    const doneCycleMap: Record<string, boolean> = {};

    for (const row of historyRows) {
      const key = `${row.customer_id}__${row.bin_type}`;
      if (doneCycleMap[key]) continue;

      const servicedDate = formatYMDFromISO(row.serviced_at);
      const info = opportunityMap[key];
      if (!info) continue;

      if (servicedDate <= todayYMD) {
        doneCycleMap[key] = true;
      }
    }

    setDoneThisCycleByCustomerBin(doneCycleMap);
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function saveCustomer() {
    setError(null);

    if (!name.trim() || !address.trim() || !city.trim()) {
      setError("Udfyld navn, adresse og by.");
      return;
    }

    if (chosenBinList.length === 0) {
      setError("Vælg mindst én beholdertype.");
      return;
    }

    setSaving(true);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from("customers")
        .insert({
          name: name.trim(),
          address: address.trim(),
          city: city.trim(),
          service_type: serviceType,
          customer_type: customerType,
        })
        .select("id")
        .single();

      if (insErr) {
        setError(insErr.message);
        return;
      }

      const customerId = (inserted as { id: string }).id;

      const binRows = chosenBinList.map((bin) => ({
        customer_id: customerId,
        bin_type: bin,
        pickup_day: "Man",
        week_group: "",
        frequency_months: serviceType === "subscription" ? binSettings[bin].frequency_months : 1,
      }));

      const { error: binsErr } = await supabase.from("customer_bins").insert(binRows);

      if (binsErr) {
        setError(
          `${binsErr.message}\n\nTip: Hvis du ser DB-fejl om "bin_type check", så skal dine tilladte værdier matche disse: madaffald, rest_plast, pap_papir, metal_glas.`
        );
        return;
      }

      setName("");
      setAddress("");
      setCity("");
      setServiceType("single");
      setCustomerType("private");
      setSelectedBins({
        madaffald: false,
        rest_plast: false,
        pap_papir: false,
        metal_glas: false,
      });

      await loadCustomers();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(customerId: string) {
    const ok = confirm("Slet kunden?");
    if (!ok) return;

    setError(null);

    const { error: bErr } = await supabase.from("customer_bins").delete().eq("customer_id", customerId);
    if (bErr) {
      setError(bErr.message);
      return;
    }

    const { error: cErr } = await supabase.from("customers").delete().eq("id", customerId);
    if (cErr) {
      setError(cErr.message);
      return;
    }

    await loadCustomers();
  }

  async function geocodeCustomer(c: CustomerRow) {
    setError(null);

    if (!c.address || !c.city) {
      setError("Kunden mangler adresse/by.");
      return;
    }

    const fullAddress = `${c.address}, ${c.city}, Denmark`;

    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: fullAddress }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ? `${json.error} (${json.status ?? "ukendt"})` : "Geocode fejl");
        return;
      }

      const { lat, lng } = json as { lat: number; lng: number };

      const { error } = await supabase.from("customers").update({ lat, lng }).eq("id", c.id);
      if (error) {
        setError(error.message);
        return;
      }

      await loadCustomers();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  async function importBofaDates(customerId: string, binType: BinType) {
    setError(null);

    const txt = prompt(
      `Indsæt BOFA-datoer for ${BIN_LABEL[binType]} (én pr linje)\n\nEksempel:\nOnsdag den 11-03-2026\nOnsdag den 25-03-2026\n...`,
      ""
    );

    if (txt === null) return;

    const ymdList = parseBofaDatesToYMD(txt);

    if (ymdList.length === 0) {
      setError("Kunne ikke finde datoer i teksten. Tjek at der står dd-mm-yyyy (fx 11-03-2026).");
      return;
    }

    const rows = ymdList.map((pickup_date) => ({
      customer_id: customerId,
      bin_type: binType,
      pickup_date,
    }));

    const { error: insErr } = await supabase.from("bofa_pickups").upsert(rows, {
      onConflict: "customer_id,bin_type,pickup_date",
    });

    if (insErr) {
      setError(insErr.message);
      return;
    }

    await loadCustomers();
  }

  const groups = useMemo(() => {
    const normType = (t: CustomerType | null) => t ?? "private";
    const normService = (s: ServiceType | null) => s ?? "single";

    const mk = (type: CustomerType, service: ServiceType) =>
      customers.filter((c) => normType(c.customer_type) === type && normService(c.service_type) === service);

    return {
      private_single: mk("private", "single"),
      private_sub: mk("private", "subscription"),
      business_single: mk("business", "single"),
      business_sub: mk("business", "subscription"),
    };
  }, [customers]);

  function renderBinStatus(customerId: string, binType: BinType) {
    const key = `${customerId}__${binType}`;
    const info = binOpportunityByCustomerBin[key];
    const isDone = doneThisCycleByCustomerBin[key];

    if (isDone) {
      return (
        <span
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
            ...nextDateBadgeStyle,
          }}
        >
          {info?.nextDate ? `Næste: ${info.nextDate}` : "Færdig for måneden"}
        </span>
      );
    }

    if (!info?.remainingCount) return null;

    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 900,
          ...counterBadgeStyle(info.remainingCount),
        }}
      >
        {info.remainingCount} forsøg tilbage
      </span>
    );
  }

  function renderTable(list: CustomerRow[]) {
    if (list.length === 0) return <div style={{ opacity: 0.75, padding: 12 }}>Ingen kunder her endnu.</div>;

    return (
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Navn</th>
              <th style={styles.th}>Adresse</th>
              <th style={styles.th}>By</th>
              <th style={styles.th}>Service</th>
              <th style={styles.th}>Spande</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Handling</th>
            </tr>
          </thead>

          <tbody>
            {list.map((c) => {
              const bins = binsByCustomer[c.id] ?? [];
              const hasCoords = Number.isFinite(c.lat ?? NaN) && Number.isFinite(c.lng ?? NaN);

              const lastDoneIso = lastDoneByCustomer[c.id] ?? null;
              const lastDoneYMD = lastDoneIso ? formatYMDFromISO(lastDoneIso) : null;
              const ago = lastDoneIso ? daysSince(lastDoneIso) : null;

              const service = (c.service_type ?? "single") as ServiceType;

              return (
                <tr key={c.id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 900 }}>{c.name}</div>

                    {lastDoneYMD ? (
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={styles.pill}>Rengjort d. {lastDoneYMD}</span>
                        {ago !== null ? <span style={doneBadgeStyle(ago)}>for {ago} dage siden</span> : null}
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Ikke rengjort endnu</div>
                    )}
                  </td>

                  <td style={styles.td}>{c.address}</td>
                  <td style={styles.td}>{c.city}</td>
                  <td style={styles.td}>{service === "subscription" ? "Abonnement" : "Enkelt"}</td>

                  <td style={styles.td}>
                    {bins.length ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {bins.map((b) => {
                          const next = nextPickupByCustomerBin[`${c.id}__${b.bin_type}`] ?? null;

                          return (
                            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 240 }}>
                                <b>
                                  {BIN_ICON[b.bin_type]} {BIN_LABEL[b.bin_type]}
                                </b>{" "}
                                <span style={{ opacity: 0.85 }}>
                                  · {service === "subscription" ? `${b.frequency_months ?? 1} md.` : "Enkelt"}
                                </span>

                                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {renderBinStatus(c.id, b.bin_type)}
                                  {next ? (
                                    <span style={styles.pill}>BOFA næste: {next}</span>
                                  ) : (
                                    <span style={{ fontSize: 12, opacity: 0.65 }}>Ingen datoer</span>
                                  )}
                                </div>
                              </div>

                              <button onClick={() => importBofaDates(c.id, b.bin_type)} style={styles.importBtn}>
                                Importér
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ opacity: 0.7 }}>-</span>
                    )}
                  </td>

                  <td style={{ ...styles.td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => router.push(`/kunder/${c.id}/historik`)}
                      style={{ ...styles.smallBtn, marginLeft: 0 }}
                    >
                      Historik
                    </button>

                    <button
                      onClick={() => geocodeCustomer(c)}
                      disabled={!c.address || !c.city}
                      style={{
                        ...styles.smallBtn,
                        opacity: !c.address || !c.city ? 0.45 : 1,
                      }}
                    >
                      {hasCoords ? "Opdater koordinater" : "Find koordinater"}
                    </button>

                    <button onClick={() => deleteCustomer(c.id)} style={{ ...styles.smallBtn, ...styles.dangerBtn }}>
                      Slet
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderCards(list: CustomerRow[]) {
    if (list.length === 0) return <div style={{ opacity: 0.75, padding: 12 }}>Ingen kunder her endnu.</div>;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {list.map((c) => {
          const bins = binsByCustomer[c.id] ?? [];
          const hasCoords = Number.isFinite(c.lat ?? NaN) && Number.isFinite(c.lng ?? NaN);

          const lastDoneIso = lastDoneByCustomer[c.id] ?? null;
          const lastDoneYMD = lastDoneIso ? formatYMDFromISO(lastDoneIso) : null;
          const ago = lastDoneIso ? daysSince(lastDoneIso) : null;

          const service = (c.service_type ?? "single") as ServiceType;

          return (
            <div key={c.id} style={styles.mobileCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{c.name}</div>
                <div style={styles.mobilePill}>{service === "subscription" ? "Abonnement" : "Enkelt"}</div>
              </div>

              <div style={{ marginTop: 6, opacity: 0.9 }}>
                {c.address}, {c.city}
              </div>

              <div style={{ marginTop: 10 }}>
                {lastDoneYMD ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={styles.pill}>Rengjort d. {lastDoneYMD}</span>
                    {ago !== null ? <span style={doneBadgeStyle(ago)}>for {ago} dage siden</span> : null}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Ikke rengjort endnu</div>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 6, opacity: 0.9 }}>Spande</div>

                {bins.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {bins.map((b) => {
                      const next = nextPickupByCustomerBin[`${c.id}__${b.bin_type}`] ?? null;

                      return (
                        <div key={b.id} style={styles.binLine}>
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {BIN_ICON[b.bin_type]} {BIN_LABEL[b.bin_type]}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                              {service === "subscription" ? `${b.frequency_months ?? 1} md.` : "Enkelt"}{" "}
                              {next ? `· BOFA næste: ${next}` : "· Ingen datoer"}
                            </div>

                            <div style={{ marginTop: 6 }}>{renderBinStatus(c.id, b.bin_type)}</div>
                          </div>

                          <button onClick={() => importBofaDates(c.id, b.bin_type)} style={styles.importBtn}>
                            Importér
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>-</div>
                )}
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => router.push(`/kunder/${c.id}/historik`)}
                  style={{ ...styles.smallBtn, marginLeft: 0 }}
                >
                  Historik
                </button>

                <button
                  onClick={() => geocodeCustomer(c)}
                  disabled={!c.address || !c.city}
                  style={{
                    ...styles.smallBtn,
                    opacity: !c.address || !c.city ? 0.45 : 1,
                    marginLeft: 0,
                  }}
                >
                  {hasCoords ? "Opdater koordinater" : "Find koordinater"}
                </button>

                <button
                  onClick={() => deleteCustomer(c.id)}
                  style={{ ...styles.smallBtn, ...styles.dangerBtn, marginLeft: 0 }}
                >
                  Slet
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: "calc(76px + env(safe-area-inset-bottom) + 24px)" }}>
      <div style={styles.page}>
        <AppHeader title="RenSpand Ruter" subtitle="Kunder" />

        <div style={styles.topRow}>
          <h1 style={styles.h1}>Kunder</h1>
          <button onClick={logout} style={styles.btn}>
            Log ud
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.card}>
          <h2 style={styles.h2}>Opret kunde</h2>

          <div style={{ marginTop: 12 }}>
            <div style={styles.sectionLabel}>Vælg service</div>
            <div style={styles.serviceGrid}>
              <button
                type="button"
                onClick={() => setServiceType("single")}
                style={{ ...styles.serviceCard, ...(serviceType === "single" ? styles.serviceCardActive : {}) }}
              >
                <div style={styles.serviceTitle}>Enkelt vask</div>
                <div style={styles.serviceSub}>Engangsservice</div>
              </button>

              <button
                type="button"
                onClick={() => setServiceType("subscription")}
                style={{ ...styles.serviceCard, ...(serviceType === "subscription" ? styles.serviceCardActive : {}) }}
              >
                <div style={styles.serviceTitle}>Abonnement</div>
                <div style={styles.serviceSub}>Gentagende vask</div>
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={styles.sectionLabel}>Kundetype</div>
            <div style={styles.serviceGrid}>
              <button
                type="button"
                onClick={() => setCustomerType("private")}
                style={{ ...styles.serviceCard, ...(customerType === "private" ? styles.serviceCardActive : {}) }}
              >
                <div style={styles.serviceTitle}>Privat</div>
                <div style={styles.serviceSub}>Husholdning</div>
              </button>

              <button
                type="button"
                onClick={() => setCustomerType("business")}
                style={{ ...styles.serviceCard, ...(customerType === "business" ? styles.serviceCardActive : {}) }}
              >
                <div style={styles.serviceTitle}>Erhverv</div>
                <div style={styles.serviceSub}>Firma / institution</div>
              </button>
            </div>
          </div>

          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>Navn</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx Jens Hansen" style={styles.input} />
            </div>

            <div>
              <label style={styles.label}>By</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Fx Rønne" style={styles.input} />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>Adresse</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Fx Nørregade 10"
                style={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={styles.sectionLabel}>Beholdertype (klik for at vælge)</div>

            <div style={{ display: "grid", gap: 10 }}>
              {(Object.keys(BIN_LABEL) as BinType[]).map((bin) => {
                const selected = selectedBins[bin];

                return (
                  <div key={bin} style={styles.binBox}>
                    <label style={styles.binHeader}>
                      <input type="checkbox" checked={selected} onChange={() => toggleBin(bin)} style={styles.checkbox} />
                      <span style={styles.binName}>
                        {BIN_ICON[bin]} {BIN_LABEL[bin]}
                      </span>
                    </label>

                    {selected && (
                      <div style={styles.binSettingsRow}>
                        {serviceType === "subscription" ? (
                          <div style={{ flex: 1 }}>
                            <div style={styles.smallLabel}>Frekvens</div>
                            <div style={styles.freqRow}>
                              {FREQS.map((f) => {
                                const active = binSettings[bin].frequency_months === f;
                                return (
                                  <button
                                    type="button"
                                    key={f}
                                    onClick={() => updateBinSetting(bin, f)}
                                    style={{ ...styles.pillBtn, ...(active ? styles.pillBtnActive : {}) }}
                                  >
                                    {f} md.
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ opacity: 0.8, fontSize: 13 }}>Enkelt vask: ingen frekvens (1 gang)</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={saveCustomer} style={styles.saveBtn} disabled={saving}>
            {saving ? "Gemmer..." : "Gem kunde"}
          </button>
        </div>

        <div style={{ marginTop: 28 }}>
          <h2 style={styles.h2}>Kundeliste</h2>

          <div style={{ display: "grid", gap: 14 }}>
            <div style={styles.groupCard}>
              <div style={styles.groupTitle}>Privat · Enkelt</div>
              {isMobile ? renderCards(groups.private_single) : renderTable(groups.private_single)}
            </div>

            <div style={styles.groupCard}>
              <div style={styles.groupTitle}>Privat · Abonnement</div>
              {isMobile ? renderCards(groups.private_sub) : renderTable(groups.private_sub)}
            </div>

            <div style={styles.groupCard}>
              <div style={styles.groupTitle}>Erhverv · Enkelt</div>
              {isMobile ? renderCards(groups.business_single) : renderTable(groups.business_single)}
            </div>

            <div style={styles.groupCard}>
              <div style={styles.groupTitle}>Erhverv · Abonnement</div>
              {isMobile ? renderCards(groups.business_sub) : renderTable(groups.business_sub)}
            </div>
          </div>
        </div>
      </div>

      <NavTabs />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 16px 60px",
    color: "#ededed",
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  h1: { fontSize: 44, margin: 0, letterSpacing: 0.2 },
  h2: { fontSize: 26, margin: "0 0 10px" },
  btn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #2a2a2a",
    background: "#171717",
    color: "#fff",
    cursor: "pointer",
  },
  error: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #6b1b1b",
    background: "#2a0f0f",
    color: "#ffb4b4",
    whiteSpace: "pre-wrap",
  },

  card: {
    marginTop: 18,
    border: "1px solid #2b2b2b",
    borderRadius: 16,
    background: "rgba(20,20,20,0.8)",
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  groupCard: {
    border: "1px solid #2b2b2b",
    borderRadius: 16,
    background: "rgba(16,16,16,0.75)",
    padding: 14,
  },
  groupTitle: { fontWeight: 900, fontSize: 16, marginBottom: 10, opacity: 0.95 },

  sectionLabel: { fontWeight: 700, opacity: 0.95, marginBottom: 10 },
  label: { display: "block", marginBottom: 6, opacity: 0.9 },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #2e2e2e",
    background: "#1c1c1c",
    color: "#fff",
    outline: "none",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 14,
  },
  serviceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  serviceCard: {
    textAlign: "left",
    padding: "14px 14px",
    borderRadius: 16,
    border: "1px solid #2b2b2b",
    background: "#171717",
    cursor: "pointer",
  },
  serviceCardActive: {
    border: "1px solid #27c26b",
    boxShadow: "0 0 0 2px rgba(39, 194, 107, 0.18) inset",
    background: "rgba(39,194,107,0.12)",
  },
  serviceTitle: { fontWeight: 900, fontSize: 18 },
  serviceSub: { marginTop: 4, opacity: 0.8 },

  binBox: {
    border: "1px solid #2b2b2b",
    borderRadius: 14,
    background: "#141414",
    padding: "10px 12px",
  },
  binHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: "#27c26b",
  },
  binName: { fontWeight: 900, fontSize: 18 },
  binSettingsRow: {
    marginTop: 10,
    borderTop: "1px solid #252525",
    paddingTop: 10,
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  smallLabel: { fontSize: 12, opacity: 0.85, marginBottom: 6, fontWeight: 700 },
  freqRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  pillBtn: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #2f2f2f",
    background: "#151515",
    color: "#fff",
    cursor: "pointer",
    minWidth: 78,
    fontWeight: 800,
  },
  pillBtnActive: {
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 0 0 2px rgba(255,255,255,0.12) inset",
  },
  saveBtn: {
    width: "100%",
    marginTop: 14,
    padding: "14px 14px",
    borderRadius: 14,
    border: "1px solid #2f2f2f",
    background: "#3a3a3a",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },

  tableWrap: {
    border: "1px solid #2b2b2b",
    borderRadius: 14,
    overflow: "hidden",
    background: "#121212",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #262626",
    fontSize: 13,
    opacity: 0.9,
    background: "#101010",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #202020",
    verticalAlign: "top",
  },

  smallBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #2f2f2f",
    background: "#1a1a1a",
    color: "#fff",
    cursor: "pointer",
    marginLeft: 8,
  },
  dangerBtn: {
    border: "1px solid #6b1b1b",
    background: "#2a0f0f",
  },
  pill: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #2b2b2b",
    background: "#111",
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.95,
  },
  importBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #2f2f2f",
    background: "#1a1a1a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },

  mobileCard: {
    border: "1px solid #2b2b2b",
    borderRadius: 16,
    background: "rgba(18,18,18,0.8)",
    padding: 14,
  },
  mobilePill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #2b2b2b",
    background: "#111",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    opacity: 0.95,
  },
  binLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 10px",
    border: "1px solid #262626",
    borderRadius: 12,
    background: "#141414",
  },
};