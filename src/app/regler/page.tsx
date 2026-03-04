"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type WeekParity = "" | "hver" | "lige" | "ulige" | "A" | "B" | "C";
type WasteType = "rest" | "madaffald" | "pap" | "glas_metal" | "storskrald" | "haveaffald";

type RuleRow = {
  id: string;
  postcode: string;
  city: string;
  waste_type: string;
  pickup_day: string;
  week_parity: string | null;
  created_at: string;
};

const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre"] as const;

const WASTE_TYPES: { value: WasteType; label: string }[] = [
  { value: "rest", label: "rest" },
  { value: "madaffald", label: "madaffald" },
  { value: "pap", label: "pap/papir" },
  { value: "glas_metal", label: "glas/metal" },
  { value: "storskrald", label: "storskrald" },
  { value: "haveaffald", label: "haveaffald" },
];

function weekParityLabel(v: string | null) {
  if (!v) return "—";
  if (v === "hver") return "hver uge";
  if (v === "lige") return "lige uger";
  if (v === "ulige") return "ulige uger";
  if (v === "A") return "A-uge";
  if (v === "B") return "B-uge";
  if (v === "C") return "C-uge";
  return v;
}

function wasteLabel(v: string) {
  const hit = WASTE_TYPES.find((x) => x.value === v);
  return hit?.label ?? v;
}

export default function ReglerPage() {
  const router = useRouter();

  // Form state
  const [postcode, setPostcode] = useState("3782");
  const [city, setCity] = useState("Klemensker");
  const [wasteType, setWasteType] = useState<WasteType>("rest");
  const [pickupDay, setPickupDay] = useState<(typeof DAYS)[number]>("Tor");
  const [weekParity, setWeekParity] = useState<WeekParity>("");

  // Data state
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterWaste, setFilterWaste] = useState<string>("alle");
  const [filterCity, setFilterCity] = useState<string>("alle");

  async function requireAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function loadRules() {
    setError(null);
    setLoading(true);

    const ok = await requireAuth();
    if (!ok) return;

    const { data, error } = await supabase
      .from("collection_rules")
      .select("id,postcode,city,waste_type,pickup_day,week_parity,created_at")
      .order("postcode", { ascending: true })
      .order("city", { ascending: true })
      .order("waste_type", { ascending: true });

    if (error) {
      setError(error.message);
      setRules([]);
      setLoading(false);
      return;
    }

    setRules((data ?? []) as RuleRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const r of rules) set.add(r.city);
    return ["alle", ...Array.from(set).sort((a, b) => a.localeCompare(b, "da"))];
  }, [rules]);

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (filterWaste !== "alle" && r.waste_type !== filterWaste) return false;
      if (filterCity !== "alle" && r.city !== filterCity) return false;
      return true;
    });
  }, [rules, filterWaste, filterCity]);

  async function addRule() {
    setError(null);

    const pc = postcode.trim();
    const c = city.trim();

    if (!pc) return setError("Postnr mangler");
    if (!/^\d{4}$/.test(pc)) return setError("Postnr skal være 4 cifre");
    if (!c) return setError("By mangler");

    setSaving(true);

    const ok = await requireAuth();
    if (!ok) return;

    const payload = {
      postcode: pc,
      city: c,
      waste_type: wasteType,
      pickup_day: pickupDay,
      week_parity: weekParity ? weekParity : null, // <— valgfri
    };

    const { error } = await supabase.from("collection_rules").insert(payload);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    await loadRules();
  }

  async function deleteRule(id: string) {
    const ok = confirm("Slet denne regel?");
    if (!ok) return;

    setError(null);

    const authOk = await requireAuth();
    if (!authOk) return;

    const { error } = await supabase.from("collection_rules").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }

    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <h1 style={styles.h1}>Regler (tømmeplan)</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.btn} onClick={() => router.push("/kort")}>
            Tilbage til kort
          </button>
          <button style={styles.btn} onClick={logout}>
            Log ud
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <h2 style={styles.h2}>Tilføj regel</h2>

        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>Postnr</label>
            <input
              style={styles.input}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="3782"
              inputMode="numeric"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>By</label>
            <input
              style={styles.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Klemensker"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Affaldstype</label>
            <select style={styles.select} value={wasteType} onChange={(e) => setWasteType(e.target.value as WasteType)}>
              {WASTE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Dag</label>
            <select style={styles.select} value={pickupDay} onChange={(e) => setPickupDay(e.target.value as any)}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Uger</label>
            <select style={styles.select} value={weekParity} onChange={(e) => setWeekParity(e.target.value as WeekParity)}>
              <option value="">— (ingen) —</option>
              <option value="hver">hver uge</option>
              <option value="lige">lige uger</option>
              <option value="ulige">ulige uger</option>
              <option value="A">A-uge</option>
              <option value="B">B-uge</option>
              <option value="C">C-uge</option>
            </select>
          </div>
        </div>

        <button style={{ ...styles.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={addRule} disabled={saving}>
          {saving ? "Gemmer..." : "Gem regel"}
        </button>
      </div>

      <div style={styles.card}>
        <div style={styles.filters}>
          <div style={styles.filterItem}>
            <label style={styles.label}>Affaldstype</label>
            <select style={styles.select} value={filterWaste} onChange={(e) => setFilterWaste(e.target.value)}>
              <option value="alle">alle</option>
              {WASTE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>By</label>
            <select style={styles.select} value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ color: "#bbb", paddingTop: 22 }}>
            Regler: <b style={{ color: "#eee" }}>{filteredRules.length}</b>
          </div>

          <button style={styles.btn} onClick={loadRules}>
            Opdater
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Postnr</th>
                <th style={styles.th}>By</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Dag</th>
                <th style={styles.th}>Uger</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={styles.td} colSpan={6}>
                    Henter regler...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={6}>
                    Ingen regler endnu.
                  </td>
                </tr>
              ) : (
                filteredRules.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.postcode}</td>
                    <td style={styles.td}>{r.city}</td>
                    <td style={styles.td}>{wasteLabel(r.waste_type)}</td>
                    <td style={styles.td}>{r.pickup_day}</td>
                    <td style={styles.td}>{weekParityLabel(r.week_parity)}</td>
                    <td style={styles.tdRight}>
                      <button style={styles.btnDanger} onClick={() => deleteRule(r.id)}>
                        Slet
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, color: "#9aa" }}>
          Tip: Start med at lave en regel pr. postnr/by pr. affaldstype (rest/madaffald/pap osv).
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#ededed",
    padding: "28px 20px",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  h1: { margin: 0, fontSize: 44, letterSpacing: 0.2 },
  h2: { margin: "0 0 14px 0", fontSize: 22 },
  card: {
    border: "1px solid #2b2b2b",
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    background: "rgba(255,255,255,0.02)",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "140px 1fr 190px 130px 170px",
    gap: 12,
    alignItems: "end",
    marginBottom: 12,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, color: "#cfcfcf" },
  input: {
    height: 40,
    borderRadius: 8,
    border: "1px solid #444",
    background: "#2c2c2c",
    color: "#fff",
    padding: "0 10px",
    outline: "none",
  },
  select: {
    height: 40,
    borderRadius: 8,
    border: "1px solid #444",
    background: "#2c2c2c",
    color: "#fff",
    padding: "0 10px",
    outline: "none",
  },
  btn: {
    height: 40,
    padding: "0 14px",
    borderRadius: 8,
    border: "1px solid #4a4a4a",
    background: "#3a3a3a",
    color: "#fff",
    cursor: "pointer",
  },
  btnPrimary: {
    height: 42,
    padding: "0 16px",
    borderRadius: 8,
    border: "1px solid #5a5a5a",
    background: "#5a5a5a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    width: 140,
  },
  btnDanger: {
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #6b3b3b",
    background: "#5a2b2b",
    color: "#fff",
    cursor: "pointer",
  },
  error: { color: "#ff5252", margin: "6px 0 14px 0" },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  filterItem: { display: "flex", flexDirection: "column", gap: 6, minWidth: 220 },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 800,
  },
  th: {
    textAlign: "left",
    fontSize: 13,
    color: "#cfcfcf",
    padding: "10px 8px",
    borderBottom: "1px solid #2b2b2b",
  },
  td: {
    padding: "10px 8px",
    borderBottom: "1px solid #222",
    color: "#eee",
  },
  tdRight: {
    padding: "10px 8px",
    borderBottom: "1px solid #222",
    textAlign: "right",
  },
};