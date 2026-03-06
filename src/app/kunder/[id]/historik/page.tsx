"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import NavTabs from "@/app/components/NavTabs";

type BinType = "madaffald" | "rest_plast" | "pap_papir" | "metal_glas";

type CustomerRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
};

type HistoryRow = {
  id: string;
  customer_id: string;
  route_stop_id: string | null;
  bin_type: BinType;
  status: "done" | "skipped";
  serviced_at: string;
  note: string | null;
  created_at: string;
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

function formatYMDFromISO(iso: string) {
  return iso.slice(0, 10);
}

function daysSince(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  const diffMs = now - t;
  const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return d >= 0 ? d : 0;
}

function badgeStyle(status: "done" | "skipped") {
  if (status === "done") {
    return {
      border: "1px solid #2ecc71",
      background: "rgba(46,204,113,0.08)",
      color: "#dff7e8",
    } as React.CSSProperties;
  }

  return {
    border: "1px solid #ff4d4f",
    background: "rgba(255,77,79,0.08)",
    color: "#ffd6d6",
  } as React.CSSProperties;
}

function agoStyle(days: number) {
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

export default function KundeHistorikPage() {
  const params = useParams();
  const router = useRouter();

  const customerId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session) {
          router.push("/login");
          return;
        }

        const { data: customerData, error: customerErr } = await supabase
          .from("customers")
          .select("id,name,address,city")
          .eq("id", customerId)
          .single();

        if (customerErr) throw customerErr;
        setCustomer(customerData as CustomerRow);

        const { data: historyData, error: historyErr } = await supabase
          .from("service_history")
          .select("id,customer_id,route_stop_id,bin_type,status,serviced_at,note,created_at")
          .eq("customer_id", customerId)
          .order("serviced_at", { ascending: false });

        if (historyErr) throw historyErr;
        setHistory((historyData ?? []) as HistoryRow[]);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, router]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, HistoryRow[]> = {};

    for (const row of history) {
      const key = row.serviced_at.slice(0, 10);
      (groups[key] ||= []).push(row);
    }

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  if (loading) {
    return <div style={{ padding: 24, color: "#ddd" }}>Indlæser historik…</div>;
  }

  return (
    <div style={{ paddingBottom: "calc(76px + env(safe-area-inset-bottom) + 24px)" }}>
      <div style={styles.page}>
        <div style={styles.topRow}>
          <div>
            <h1 style={styles.h1}>Historik</h1>
            {customer ? (
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                <b>{customer.name}</b>
                <br />
                {customer.address ?? ""}
                {customer.city ? `, ${customer.city}` : ""}
              </div>
            ) : null}
          </div>

          <button onClick={() => router.push("/kunder")} style={styles.btn}>
            Tilbage
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {!error && history.length === 0 ? (
          <div style={styles.emptyCard}>Ingen historik endnu på denne kunde.</div>
        ) : null}

        <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
          {groupedHistory.map(([date, rows]) => (
            <div key={date} style={styles.dayCard}>
              <div style={styles.dayTitle}>{date}</div>

              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {rows.map((row) => {
                  const ago = daysSince(row.serviced_at);

                  return (
                    <div key={row.id} style={styles.historyItem}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 18 }}>
                            {BIN_ICON[row.bin_type]} {BIN_LABEL[row.bin_type]}
                          </div>

                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              style={{
                                ...styles.statusPill,
                                ...badgeStyle(row.status),
                              }}
                            >
                              {row.status === "done" ? "Rengjort" : "Ikke muligt"} d. {formatYMDFromISO(row.serviced_at)}
                            </span>

                            {ago !== null ? <span style={agoStyle(ago)}>for {ago} dage siden</span> : null}
                          </div>

                          {row.note ? (
                            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.92 }}>
                              <b>Note:</b> {row.note}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <NavTabs />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "28px 16px 60px",
    color: "#ededed",
  },
  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  h1: {
    fontSize: 40,
    margin: 0,
    letterSpacing: 0.2,
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #2a2a2a",
    background: "#171717",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
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
  emptyCard: {
    marginTop: 18,
    border: "1px solid #2b2b2b",
    borderRadius: 16,
    background: "rgba(16,16,16,0.75)",
    padding: 18,
    opacity: 0.8,
  },
  dayCard: {
    border: "1px solid #2b2b2b",
    borderRadius: 16,
    background: "rgba(16,16,16,0.75)",
    padding: 14,
  },
  dayTitle: {
    fontWeight: 900,
    fontSize: 18,
    opacity: 0.96,
  },
  historyItem: {
    border: "1px solid #262626",
    borderRadius: 14,
    background: "#111",
    padding: 12,
  },
  statusPill: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.95,
  },
};