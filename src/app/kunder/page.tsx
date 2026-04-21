"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import NavTabs from "@/app/components/NavTabs";
import AppHeader from "@/app/components/AppHeader";

type ServiceType = "single" | "subscription";
type CustomerType = "private" | "business";
type BinType = "madaffald" | "rest_plast" | "pap_metal";
type MonthFreq = 1 | 2 | 3 | 6;
type WeekFreq = 1 | 2 | 3;
type FrequencyType = "weekly" | "monthly";

type CustomerRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
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
  frequency_type: "weekly" | "monthly" | null;
  frequency_months: number | null;
  frequency_weeks: number | null;
  quantity: number | null;
  is_active: boolean | null;
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

type CustomerDocRow = {
  customer_id: string;
  note: string | null;
  note_image_path: string | null;
  route_day_id: string | null;
};

type RouteDayMini = {
  id: string;
  route_date: string;
};

type CustomerDocInfo = {
  note: string | null;
  note_image_path: string | null;
  routeDate: string | null;
};

type CustomerGroupMeta = {
  key: string;
  title: string;
  subtitle: string;
  count: number;
  customers: CustomerRow[];
  accent: string;
  accentSoft: string;
  accentText: string;
};

type BinSelectionState = Record<
  BinType,
  {
    selected: boolean;
    quantity: 1 | 2 | 3;
    frequency_type: FrequencyType;
    frequency_months: MonthFreq;
    frequency_weeks: WeekFreq;
  }
>;

const BIN_LABEL: Record<BinType, string> = {
  madaffald: "Madaffald",
  rest_plast: "Rest + plast",
  pap_metal: "Papir/pap + metal/glas",
};

const BIN_ICON: Record<BinType, string> = {
  madaffald: "🍎",
  rest_plast: "🗑️",
  pap_metal: "♻️",
};

const FREQS: Freq[] = [1, 2, 3, 6];
const QUANTITIES: Array<1 | 2 | 3> = [1, 2, 3];

function getInitialBinState(): BinSelectionState {
  return {
    madaffald: {
      selected: false,
      quantity: 1,
      frequency_type: "monthly",
      frequency_months: 1,
      frequency_weeks: 1,
    },
    rest_plast: {
      selected: false,
      quantity: 1,
      frequency_type: "monthly",
      frequency_months: 1,
      frequency_weeks: 1,
    },
    pap_metal: {
      selected: false,
      quantity: 1,
      frequency_type: "monthly",
      frequency_months: 1,
      frequency_weeks: 1,
    },
  };
}

function formatYMDFromISO(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso.slice(0, 10);
  return `${d}-${m}-${y}`;
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

function getRouteNotePublicUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data } = supabase.storage.from("route-notes").getPublicUrl(path);
  return data.publicUrl;
}

function getCustomerTypeTheme(service: ServiceType) {
  if (service === "subscription") {
    return {
      border: "#2ecc71",
      bg: "rgba(46,204,113,0.12)",
      color: "#dff7e8",
      label: "Abonnement",
    };
  }

  return {
    border: "#777",
    bg: "rgba(255,255,255,0.05)",
    color: "#f3f3f3",
    label: "Enkelt",
  };
}

function getCustomerTypeLabelDa(type: CustomerType | null) {
  return (type ?? "private") === "business" ? "Erhverv" : "Privat";
}

export default function KunderPage() {
  const router = useRouter();

  const [isMobile, setIsMobile] = useState(false);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    private_single: false,
    private_sub: false,
    business_single: false,
    business_sub: false,
  });

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
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [binSelections, setBinSelections] = useState<BinSelectionState>(getInitialBinState());

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [binsByCustomer, setBinsByCustomer] = useState<Record<string, BinRow[]>>({});
  const [lastDoneByCustomer, setLastDoneByCustomer] = useState<Record<string, string | null>>({});
  const [nextPickupByCustomerBin, setNextPickupByCustomerBin] = useState<Record<string, string | null>>({});
  const [binOpportunityByCustomerBin, setBinOpportunityByCustomerBin] = useState<Record<string, BinOpportunityInfo>>(
    {}
  );
  const [doneThisCycleByCustomerBin, setDoneThisCycleByCustomerBin] = useState<Record<string, boolean>>({});
  const [latestDocByCustomer, setLatestDocByCustomer] = useState<Record<string, CustomerDocInfo>>({});

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editServiceType, setEditServiceType] = useState<ServiceType>("single");
  const [editCustomerType, setEditCustomerType] = useState<CustomerType>("private");

  const [noteModalCustomer, setNoteModalCustomer] = useState<CustomerRow | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCustomerType, setFilterCustomerType] = useState<"all" | CustomerType>("all");
  const [filterServiceType, setFilterServiceType] = useState<"all" | ServiceType>("all");
  const [filterActiveStatus, setFilterActiveStatus] = useState<"all" | "active" | "inactive">("all");

  const chosenBinList = useMemo(
    () => (Object.keys(binSelections) as BinType[]).filter((bin) => binSelections[bin].selected),
    [binSelections]
  );

  function toggleCustomerExpanded(customerId: string) {
    setExpandedCustomers((prev) => ({
      ...prev,
      [customerId]: !prev[customerId],
    }));
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  function openNoteModal(customer: CustomerRow) {
    setNoteModalCustomer(customer);
    setNoteDraft(customer.note ?? "");
  }

  function closeNoteModal() {
    setNoteModalCustomer(null);
    setNoteDraft("");
  }

  function toggleBin(bin: BinType) {
    setBinSelections((prev) => ({
      ...prev,
      [bin]: {
        ...prev[bin],
        selected: !prev[bin].selected,
      },
    }));
  }

  function updateBinFrequency(bin: BinType, freq: Freq) {
    setBinSelections((prev) => ({
      ...prev,
      [bin]: {
        ...prev[bin],
        frequency_months: freq,
      },
    }));
  }

function updateBinFrequencyType(bin: BinType, type: FrequencyType) {
  setBinSelections((prev) => ({
    ...prev,
    [bin]: {
      ...prev[bin],
      frequency_type: type,
    },
  }));
}

function updateBinMonthFrequency(bin: BinType, freq: MonthFreq) {
  setBinSelections((prev) => ({
    ...prev,
    [bin]: {
      ...prev[bin],
      frequency_months: freq,
    },
  }));
}

function updateBinWeekFrequency(bin: BinType, freq: WeekFreq) {
  setBinSelections((prev) => ({
    ...prev,
    [bin]: {
      ...prev[bin],
      frequency_weeks: freq,
    },
  }));
}

  function updateBinQuantity(bin: BinType, quantity: 1 | 2 | 3) {
    setBinSelections((prev) => ({
      ...prev,
      [bin]: {
        ...prev[bin],
        quantity,
      },
    }));
  }

  function startEditCustomer(c: CustomerRow) {
    setEditingCustomerId(c.id);
    setEditName(c.name ?? "");
    setEditAddress(c.address ?? "");
    setEditCity(c.city ?? "");
    setEditPhone(c.phone ?? "");
    setEditEmail(c.email ?? "");
    setEditServiceType((c.service_type ?? "single") as ServiceType);
    setEditCustomerType((c.customer_type ?? "private") as CustomerType);

    setExpandedCustomers((prev) => ({
      ...prev,
      [c.id]: true,
    }));
  }

  function cancelEditCustomer() {
    setEditingCustomerId(null);
    setEditName("");
    setEditAddress("");
    setEditCity("");
    setEditPhone("");
    setEditEmail("");
    setEditServiceType("single");
    setEditCustomerType("private");
  }

  async function saveEditedCustomer(customerId: string) {
    setError(null);

    if (!editName.trim() || !editAddress.trim() || !editCity.trim()) {
      setError("Udfyld navn, adresse og by.");
      return;
    }

    setEditSaving(true);

    try {
      const { error } = await supabase
        .from("customers")
        .update({
          name: editName.trim(),
          address: editAddress.trim(),
          city: editCity.trim(),
          phone: editPhone.trim() || null,
          email: editEmail.trim() || null,
          service_type: editServiceType,
          customer_type: editCustomerType,
        })
        .eq("id", customerId);

      if (error) {
        setError(error.message);
        return;
      }

      await loadCustomers();
      cancelEditCustomer();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setEditSaving(false);
    }
  }

  async function saveCustomerNote() {
    if (!noteModalCustomer) return;

    setError(null);
    setNoteSaving(true);

    try {
      const { error } = await supabase
        .from("customers")
        .update({
          note: noteDraft.trim() || null,
        })
        .eq("id", noteModalCustomer.id);

      if (error) {
        setError(error.message);
        return;
      }

      await loadCustomers();
      closeNoteModal();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setNoteSaving(false);
    }
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
      .select("id,name,address,city,phone,email,note,lat,lng,service_type,customer_type,created_at")
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
      setLatestDocByCustomer({});
      return;
    }

    const { data: bData, error: bErr } = await supabase
      .from("customer_bins")
      .select("id,customer_id,bin_type,pickup_day,week_group,frequency_months,frequency_weeks,quantity,is_active")
      .in("customer_id", ids);

    if (bErr) {
      setError(bErr.message);
      setBinsByCustomer({});
      setLastDoneByCustomer({});
      setNextPickupByCustomerBin({});
      setBinOpportunityByCustomerBin({});
      setDoneThisCycleByCustomerBin({});
      setLatestDocByCustomer({});
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
      setLatestDocByCustomer({});
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
      setLatestDocByCustomer({});
      return;
    }

    const historyRows = (historyData ?? []) as ServiceHistoryRow[];
    const doneCycleMap: Record<string, boolean> = {};

    for (const row of historyRows) {
      const key = `${row.customer_id}__${row.bin_type}`;
      if (doneCycleMap[key]) continue;

      const servicedDate = row.serviced_at.slice(0, 10);
      const info = opportunityMap[key];
      if (!info) continue;

      if (servicedDate <= todayYMD) {
        doneCycleMap[key] = true;
      }
    }

    setDoneThisCycleByCustomerBin(doneCycleMap);

    const { data: docData, error: docErr } = await supabase
      .from("route_stops")
      .select("customer_id,note,note_image_path,route_day_id")
      .in("customer_id", ids)
      .or("note.not.is.null,note_image_path.not.is.null");

    if (docErr) {
      setLatestDocByCustomer({});
      return;
    }

    const routeDayIds = Array.from(
      new Set(
        ((docData ?? []) as CustomerDocRow[])
          .map((r) => r.route_day_id)
          .filter((v): v is string => !!v)
      )
    );

    let routeDayMap: Record<string, string> = {};

    if (routeDayIds.length > 0) {
      const { data: rdData, error: rdErr } = await supabase
        .from("route_days")
        .select("id,route_date")
        .in("id", routeDayIds);

      if (!rdErr) {
        routeDayMap = Object.fromEntries(((rdData ?? []) as RouteDayMini[]).map((r) => [r.id, r.route_date]));
      }
    }

    const docMap: Record<string, CustomerDocInfo> = {};

    for (const row of (docData ?? []) as CustomerDocRow[]) {
      const routeDate = row.route_day_id ? routeDayMap[row.route_day_id] ?? null : null;
      const existing = docMap[row.customer_id];

      const shouldReplace =
        !existing ||
        (routeDate ?? "") > (existing.routeDate ?? "") ||
        ((routeDate ?? "") === (existing.routeDate ?? "") && !!row.note_image_path && !existing.note_image_path);

      if (shouldReplace) {
        docMap[row.customer_id] = {
          note: row.note,
          note_image_path: row.note_image_path,
          routeDate,
        };
      }
    }

    setLatestDocByCustomer(docMap);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function reactivateBin(binId: string) {
    try {
      setError(null);

      const { error } = await supabase.from("customer_bins").update({ is_active: true }).eq("id", binId);

      if (error) {
        setError(error.message);
        return;
      }

      await loadCustomers();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  async function deactivateBin(binId: string) {
    try {
      setError(null);

      const { error } = await supabase.from("customer_bins").update({ is_active: false }).eq("id", binId);

      if (error) {
        setError(error.message);
        return;
      }

      await loadCustomers();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
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
          phone: phone.trim() || null,
          email: email.trim() || null,
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
  frequency_type: serviceType === "subscription" ? binSelections[bin].frequency_type : "monthly",
  frequency_months:
    serviceType === "subscription" && binSelections[bin].frequency_type === "monthly"
      ? binSelections[bin].frequency_months
      : null,
  frequency_weeks:
    serviceType === "subscription" && binSelections[bin].frequency_type === "weekly"
      ? binSelections[bin].frequency_weeks
      : null,
  quantity: binSelections[bin].quantity,
  is_active: true,
}));
      const { error: binsErr } = await supabase.from("customer_bins").insert(binRows);

      if (binsErr) {
        setError(`${binsErr.message}\n\nTip: Tilladte bin_type værdier skal nu være: madaffald, rest_plast, pap_metal.`);
        return;
      }

      setName("");
      setAddress("");
      setCity("");
      setPhone("");
      setEmail("");
      setServiceType("single");
      setCustomerType("private");
      setBinSelections(getInitialBinState());

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

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return customers.filter((c) => {
      const normType = (c.customer_type ?? "private") as CustomerType;
      const normService = (c.service_type ?? "single") as ServiceType;
      const bins = binsByCustomer[c.id] ?? [];

      const hasActiveBins = bins.some((b) => b.is_active !== false);
      const hasInactiveBins = bins.some((b) => b.is_active === false);

      const matchesSearch =
        !q ||
        [c.name ?? "", c.address ?? "", c.city ?? "", c.phone ?? "", c.email ?? "", c.note ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);

      const matchesCustomerType = filterCustomerType === "all" || normType === filterCustomerType;
      const matchesServiceType = filterServiceType === "all" || normService === filterServiceType;
      const matchesActiveStatus =
      filterActiveStatus === "all" ||
     (filterActiveStatus === "active" && hasActiveBins) ||
     (filterActiveStatus === "inactive" && bins.length > 0 && bins.every((b) => b.is_active === false));

      return matchesSearch && matchesCustomerType && matchesServiceType && matchesActiveStatus;
    });
  }, [customers, binsByCustomer, searchTerm, filterCustomerType, filterServiceType, filterActiveStatus]);

  const groupedFilteredCustomers = useMemo(() => {
    return {
      private_single: filteredCustomers.filter(
        (c) => (c.customer_type ?? "private") === "private" && (c.service_type ?? "single") === "single"
      ),
      private_sub: filteredCustomers.filter(
        (c) => (c.customer_type ?? "private") === "private" && (c.service_type ?? "single") === "subscription"
      ),
      business_single: filteredCustomers.filter(
        (c) => (c.customer_type ?? "private") === "business" && (c.service_type ?? "single") === "single"
      ),
      business_sub: filteredCustomers.filter(
        (c) => (c.customer_type ?? "private") === "business" && (c.service_type ?? "single") === "subscription"
      ),
    };
  }, [filteredCustomers]);

  const groupedSections = useMemo<CustomerGroupMeta[]>(() => {
    return [
      {
        key: "private_single",
        title: "Privat · Enkelt",
        subtitle: "Private kunder med engangsservice",
        count: groupedFilteredCustomers.private_single.length,
        customers: groupedFilteredCustomers.private_single,
        accent: "#4ea1ff",
        accentSoft: "rgba(78,161,255,0.10)",
        accentText: "#dbeeff",
      },
      {
        key: "private_sub",
        title: "Privat · Abonnement",
        subtitle: "Private kunder på fast abonnement",
        count: groupedFilteredCustomers.private_sub.length,
        customers: groupedFilteredCustomers.private_sub,
        accent: "#2ecc71",
        accentSoft: "rgba(46,204,113,0.10)",
        accentText: "#dff7e8",
      },
      {
        key: "business_single",
        title: "Erhverv · Enkelt",
        subtitle: "Erhvervskunder med engangsservice",
        count: groupedFilteredCustomers.business_single.length,
        customers: groupedFilteredCustomers.business_single,
        accent: "#f39c12",
        accentSoft: "rgba(243,156,18,0.10)",
        accentText: "#ffe7bf",
      },
      {
        key: "business_sub",
        title: "Erhverv · Abonnement",
        subtitle: "Erhvervskunder på fast abonnement",
        count: groupedFilteredCustomers.business_sub.length,
        customers: groupedFilteredCustomers.business_sub,
        accent: "#9b59b6",
        accentSoft: "rgba(155,89,182,0.12)",
        accentText: "#f0ddff",
      },
    ];
  }, [groupedFilteredCustomers]);

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
          {info?.nextDate ? `Næste: ${formatYMDFromISO(info.nextDate)}` : "Færdig for måneden"}
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

  function renderEditForm(customerId: string) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 16,
          border: "1px solid #262626",
          background: "rgba(8,8,8,0.9)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>Rediger kunde</div>

        <div style={styles.formGrid}>
          <div>
            <label style={styles.label}>Navn</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Fx Jens Hansen"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>By</label>
            <input
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              placeholder="Fx Rønne"
              style={styles.input}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={styles.label}>Adresse</label>
            <input
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder="Fx Nørregade 10"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Telefonnummer</label>
            <input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="Fx 20112233"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Email</label>
            <input
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Fx kunde@mail.dk"
              style={styles.input}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={styles.sectionLabel}>Service</div>
          <div style={styles.serviceGrid}>
            <button
              type="button"
              onClick={() => setEditServiceType("single")}
              style={{
                ...styles.serviceCard,
                ...(editServiceType === "single" ? styles.serviceCardActive : {}),
              }}
            >
              <div style={styles.serviceTitle}>Enkelt vask</div>
              <div style={styles.serviceSub}>Engangsservice</div>
            </button>

            <button
              type="button"
              onClick={() => setEditServiceType("subscription")}
              style={{
                ...styles.serviceCard,
                ...(editServiceType === "subscription" ? styles.serviceCardActive : {}),
              }}
            >
              <div style={styles.serviceTitle}>Abonnement</div>
              <div style={styles.serviceSub}>Gentagende vask</div>
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={styles.sectionLabel}>Kundetype</div>
          <div style={styles.serviceGrid}>
            <button
              type="button"
              onClick={() => setEditCustomerType("private")}
              style={{
                ...styles.serviceCard,
                ...(editCustomerType === "private" ? styles.serviceCardActive : {}),
              }}
            >
              <div style={styles.serviceTitle}>Privat</div>
              <div style={styles.serviceSub}>Husholdning</div>
            </button>

            <button
              type="button"
              onClick={() => setEditCustomerType("business")}
              style={{
                ...styles.serviceCard,
                ...(editCustomerType === "business" ? styles.serviceCardActive : {}),
              }}
            >
              <div style={styles.serviceTitle}>Erhverv</div>
              <div style={styles.serviceSub}>Firma / institution</div>
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => saveEditedCustomer(customerId)}
            disabled={editSaving}
            style={{
              ...styles.smallBtn,
              border: "1px solid #2ecc71",
              background: "#12301f",
              color: "#dff7e8",
              fontWeight: 900,
              marginLeft: 0,
            }}
          >
            {editSaving ? "Gemmer..." : "Gem ændringer"}
          </button>

          <button
            onClick={cancelEditCustomer}
            disabled={editSaving}
            style={{
              ...styles.smallBtn,
              marginLeft: 0,
            }}
          >
            Annuller
          </button>
        </div>
      </div>
    );
  }

  function renderLatestDocumentation(customerId: string) {
    const doc = latestDocByCustomer[customerId];
    if (!doc) return null;

    const imageUrl = getRouteNotePublicUrl(doc.note_image_path);

    return (
      <div
        style={{
          marginTop: 8,
          padding: 10,
          borderRadius: 12,
          border: "1px solid #2b2b2b",
          background: "#101010",
          maxWidth: 240,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
          Dokumentation{doc.routeDate ? ` · ${formatYMDFromISO(doc.routeDate)}` : ""}
        </div>

        {doc.note ? (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{doc.note}</div>
        ) : null}

        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Dokumentation"
            style={{
              width: "100%",
              marginTop: 8,
              borderRadius: 10,
              border: "1px solid #333",
              display: "block",
            }}
          />
        ) : null}
      </div>
    );
  }

  function renderExpandedContent(c: CustomerRow, service: ServiceType) {
    const bins = binsByCustomer[c.id] ?? [];

    return (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {editingCustomerId === c.id ? renderEditForm(c.id) : null}

        {renderLatestDocumentation(c.id)}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 10, opacity: 0.95 }}>Spande</div>

          {bins.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {bins.map((b) => {
                const next = nextPickupByCustomerBin[`${c.id}__${b.bin_type}`] ?? null;
                const isActive = b.is_active !== false;
                const isSingle = service === "single";
                const qty = Math.max(1, Number(b.quantity ?? 1));

                return (
                  <div key={b.id} style={styles.binLine}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 900 }}>
                        {BIN_ICON[b.bin_type]} {BIN_LABEL[b.bin_type]}
                        <span style={{ opacity: 0.8, fontWeight: 500 }}>
                          {" "}
                          ×{qty} · {service === "subscription"
  ? b.frequency_type === "weekly"
    ? b.frequency_weeks === 1
      ? "Hver uge"
      : `Hver ${b.frequency_weeks} uge`
    : `${b.frequency_months ?? 1} md.`
  : "Enkelt"}
                        </span>
                      </div>

                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span
                          style={{
                            ...styles.pill,
                            border: isActive ? "1px solid #2ecc71" : "1px solid #f1c40f",
                            background: isActive ? "rgba(46,204,113,0.08)" : "rgba(241,196,15,0.10)",
                            color: isActive ? "#dff7e8" : "#fff0b3",
                          }}
                        >
                          {isActive ? "Aktiv" : "I bero"}
                        </span>

                        <span style={styles.pill}>Antal: {qty}</span>

                        {renderBinStatus(c.id, b.bin_type)}

                        {next ? (
                          <span style={styles.pill}>BOFA næste: {formatYMDFromISO(next)}</span>
                        ) : (
                          <span style={{ fontSize: 12, opacity: 0.65 }}>Ingen datoer</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button onClick={() => importBofaDates(c.id, b.bin_type)} style={styles.importBtn}>
                        Importér
                      </button>

                      {isSingle && !isActive ? (
                        <button
                          onClick={() => reactivateBin(b.id)}
                          style={{
                            ...styles.smallBtn,
                            border: "1px solid #2ecc71",
                            background: "#0f2a1b",
                            color: "#dff7e8",
                            marginLeft: 0,
                            fontWeight: 900,
                          }}
                        >
                          Genaktivér enkelt vask
                        </button>
                      ) : null}

                      {isSingle && isActive ? (
                        <button
                          onClick={() => deactivateBin(b.id)}
                          style={{
                            ...styles.smallBtn,
                            border: "1px solid #f1c40f",
                            background: "#2a230a",
                            color: "#fff0b3",
                            marginLeft: 0,
                            fontWeight: 900,
                          }}
                        >
                          Sæt i bero
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Ingen spande endnu.</div>
          )}
        </div>
      </div>
    );
  }

  function renderCustomerCard(c: CustomerRow) {
    const hasCoords = Number.isFinite(c.lat ?? NaN) && Number.isFinite(c.lng ?? NaN);
    const lastDoneIso = lastDoneByCustomer[c.id] ?? null;
    const lastDoneYMD = lastDoneIso ? formatYMDFromISO(lastDoneIso) : null;
    const ago = lastDoneIso ? daysSince(lastDoneIso) : null;
    const service = (c.service_type ?? "single") as ServiceType;
    const customerType = (c.customer_type ?? "private") as CustomerType;
    const isExpanded = !!expandedCustomers[c.id];
    const bins = binsByCustomer[c.id] ?? [];
    const activeBins = bins.filter((b) => b.is_active !== false);
    const inactiveBins = bins.filter((b) => b.is_active === false);
    const theme = getCustomerTypeTheme(service);
    const hasHistory = !!latestDocByCustomer[c.id];
    const hasNote = !!(c.note && c.note.trim());

    return (
      <div style={styles.customerShell} key={c.id}>
        <div style={styles.customerShellGlow} />

        <div style={styles.customerCardTop}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.customerTopLine}>
              <div style={styles.customerName}>{c.name}</div>

              <div style={styles.customerTopBadges}>
                <span
                  style={{
                    ...styles.cardBadge,
                    border: `1px solid ${theme.border}`,
                    background: theme.bg,
                    color: theme.color,
                  }}
                >
                  {theme.label}
                </span>

                <span style={styles.cardBadgeMuted}>{getCustomerTypeLabelDa(customerType)}</span>

                {lastDoneYMD ? (
                  <span style={styles.cardBadgeMuted}>Sidst: {lastDoneYMD}</span>
                ) : (
                  <span style={styles.cardBadgeMuted}>Ingen historik</span>
                )}

                {hasNote ? <span style={styles.cardBadgeNote}>📌 Note</span> : null}
              </div>
            </div>

            <div style={styles.customerAddress}>
              {c.address}, {c.city}
            </div>

            {(c.email || c.phone) && (
              <div style={styles.customerContactRow}>
                {c.email ? <span style={styles.contactText}>✉️ {c.email}</span> : null}
                {c.phone ? <span style={styles.contactText}>📞 {c.phone}</span> : null}
              </div>
            )}

            <div style={styles.customerMetaRow}>
              {activeBins.slice(0, 3).map((b) => {
                const qty = Math.max(1, Number(b.quantity ?? 1));
                return (
                  <span key={`${c.id}-${b.id}`} style={styles.binMiniBadge}>
                    {BIN_ICON[b.bin_type]} {BIN_LABEL[b.bin_type]} ×{qty}
                  </span>
                );
              })}

              {activeBins.length > 3 ? (
                <span style={styles.cardBadgeMuted}>+{activeBins.length - 3} flere</span>
              ) : null}

              {inactiveBins.length > 0 ? (
                <span style={styles.cardBadgeWarning}>{inactiveBins.length} i bero</span>
              ) : null}

              {!hasCoords ? <span style={styles.cardBadgeDanger}>Mangler koordinater</span> : null}

              {ago !== null ? <span style={doneBadgeStyle(ago)}>for {ago} dage siden</span> : null}
            </div>
          </div>

          <div
            style={{
              ...styles.cardActionArea,
              width: isMobile ? "100%" : undefined,
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <button
              onClick={() => router.push(`/kunder/${c.id}/historik`)}
              style={{
                ...styles.cardActionBtn,
                ...(hasHistory ? styles.cardActionBtnGreen : {}),
              }}
            >
              📷 Historik
            </button>

            <button
              onClick={() => startEditCustomer(c)}
              style={{
                ...styles.cardActionBtn,
                ...styles.cardActionBtnBlue,
              }}
            >
              📝 Rediger
            </button>

            <button
              onClick={() => openNoteModal(c)}
              style={{
                ...styles.cardIconBtn,
                ...(hasNote ? styles.cardIconBtnNoteActive : {}),
              }}
              title={hasNote ? "Vis/rediger note" : "Tilføj note"}
              aria-label={hasNote ? "Vis eller rediger note" : "Tilføj note"}
            >
              📌
            </button>

            <button
              onClick={() => geocodeCustomer(c)}
              disabled={!c.address || !c.city}
              style={{
                ...styles.cardActionBtn,
                opacity: !c.address || !c.city ? 0.45 : 1,
              }}
            >
              📍 Koordinater
            </button>

            <button
              onClick={() => deleteCustomer(c.id)}
              style={{
                ...styles.cardActionBtn,
                ...styles.cardActionBtnDanger,
              }}
            >
              🗑️ Slet
            </button>

            <button
              type="button"
              onClick={() => toggleCustomerExpanded(c.id)}
              style={styles.cardExpandBtn}
            >
              {isExpanded ? "▴" : "▾"}
            </button>
          </div>
        </div>

        {isExpanded ? renderExpandedContent(c, service) : null}
      </div>
    );
  }

  function renderCustomerList(list: CustomerRow[]) {
    if (list.length === 0) {
      return <div style={{ opacity: 0.72, padding: 16 }}>Ingen kunder i denne gruppe.</div>;
    }

    return <div style={{ display: "grid", gap: 12 }}>{list.map((c) => renderCustomerCard(c))}</div>;
  }

  function renderCustomerGroup(group: CustomerGroupMeta) {
    const collapsed = !!collapsedGroups[group.key];

    return (
      <section key={group.key} style={styles.groupSection}>
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          style={{
            ...styles.groupHeaderBtn,
            border: `1px solid ${group.accent}33`,
            background: `linear-gradient(180deg, ${group.accentSoft} 0%, rgba(255,255,255,0.02) 100%)`,
          }}
        >
          <div style={styles.groupHeaderLeft}>
            <div
              style={{
                ...styles.groupAccentBar,
                background: group.accent,
                boxShadow: `0 0 20px ${group.accent}55`,
              }}
            />

            <div>
              <div style={styles.groupTitleRow}>
                <h3 style={styles.groupTitle}>{group.title}</h3>
                <span
                  style={{
                    ...styles.groupCountPill,
                    border: `1px solid ${group.accent}66`,
                    background: group.accentSoft,
                    color: group.accentText,
                  }}
                >
                  {group.count} kunde{group.count === 1 ? "" : "r"}
                </span>
              </div>

              <div style={styles.groupSubtitle}>{group.subtitle}</div>
            </div>
          </div>

          <div style={styles.groupChevron}>{collapsed ? "▸" : "▾"}</div>
        </button>

        {!collapsed ? <div style={{ marginTop: 14 }}>{renderCustomerList(group.customers)}</div> : null}
      </section>
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
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Fx Jens Hansen"
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>By</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Fx Rønne"
                style={styles.input}
              />
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

            <div>
              <label style={styles.label}>Telefonnummer</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Fx 20112233"
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Fx kunde@mail.dk"
                style={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={styles.sectionLabel}>Beholdertype (klik for at vælge)</div>

            <div style={{ display: "grid", gap: 10 }}>
              {(Object.keys(BIN_LABEL) as BinType[]).map((bin) => {
                const selected = binSelections[bin].selected;
                const quantity = binSelections[bin].quantity;
                const freq = binSelections[bin].frequency_months;

                return (
                  <div key={bin} style={styles.binBox}>
                    <label style={styles.binHeader}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleBin(bin)}
                        style={styles.checkbox}
                      />
                      <span style={styles.binName}>
                        {BIN_ICON[bin]} {BIN_LABEL[bin]}
                      </span>
                    </label>

                    {selected && (
                      <div style={styles.binSettingsRow}>
                        <div>
                          <div style={styles.smallLabel}>Antal</div>
                          <div style={styles.freqRow}>
                            {QUANTITIES.map((q) => {
                              const active = quantity === q;
                              return (
                                <button
                                  type="button"
                                  key={q}
                                  onClick={() => updateBinQuantity(bin, q)}
                                  style={{ ...styles.pillBtn, ...(active ? styles.pillBtnActive : {}) }}
                                >
                                  {q} stk.
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {serviceType === "subscription" ? (
  <div style={{ display: "grid", gap: 12, width: "100%" }}>
    <div>
      <div style={styles.smallLabel}>Frekvenstype</div>
      <div style={styles.freqRow}>
        <button
          type="button"
          onClick={() => updateBinFrequencyType(bin, "weekly")}
          style={{
            ...styles.pillBtn,
            ...(binSelections[bin].frequency_type === "weekly" ? styles.pillBtnActive : {}),
          }}
        >
          Uger
        </button>

        <button
          type="button"
          onClick={() => updateBinFrequencyType(bin, "monthly")}
          style={{
            ...styles.pillBtn,
            ...(binSelections[bin].frequency_type === "monthly" ? styles.pillBtnActive : {}),
          }}
        >
          Måneder
        </button>
      </div>
    </div>

    {binSelections[bin].frequency_type === "weekly" ? (
      <div>
        <div style={styles.smallLabel}>Ugefrekvens</div>
        <div style={styles.freqRow}>
          {[1, 2, 3].map((f) => {
            const active = binSelections[bin].frequency_weeks === f;
            return (
              <button
                type="button"
                key={f}
                onClick={() => updateBinWeekFrequency(bin, f as WeekFreq)}
                style={{ ...styles.pillBtn, ...(active ? styles.pillBtnActive : {}) }}
              >
                {f === 1 ? "Hver uge" : f === 2 ? "Hver 2 uge" : "Hver 3 uge"}
              </button>
            );
          })}
        </div>
      </div>
    ) : (
      <div>
        <div style={styles.smallLabel}>Månedsfrekvens</div>
        <div style={styles.freqRow}>
          {FREQS.map((f) => {
            const active = binSelections[bin].frequency_months === f;
            return (
              <button
                type="button"
                key={f}
                onClick={() => updateBinMonthFrequency(bin, f)}
                style={{ ...styles.pillBtn, ...(active ? styles.pillBtnActive : {}) }}
              >
                {f} md.
              </button>
            );
          })}
        </div>
      </div>
    )}
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

        <div style={{ marginTop: 30 }}>
          <div style={styles.listHeaderRow}>
            <div>
              <h2 style={{ ...styles.h2, marginBottom: 6 }}>Kundeliste</h2>
              <div style={{ opacity: 0.72, fontSize: 14 }}>Søg, filtrér og administrér dine kunder</div>
            </div>

            <div style={styles.customerCountPill}>
              {filteredCustomers.length} kunde{filteredCustomers.length === 1 ? "" : "r"}
            </div>
          </div>

          <div style={styles.searchPanel}>
            <div style={styles.searchInputWrap}>
              <span style={styles.searchIcon}>⌕</span>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Søg kunde"
                style={styles.searchInput}
              />
            </div>

            <div style={styles.filterGrid}>
              <div>
                <label style={styles.label}>Kundetype</label>
                <select
                  value={filterCustomerType}
                  onChange={(e) => setFilterCustomerType(e.target.value as "all" | CustomerType)}
                  style={styles.select}
                >
                  <option value="all">Alle</option>
                  <option value="private">Privat</option>
                  <option value="business">Erhverv</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Service</label>
                <select
                  value={filterServiceType}
                  onChange={(e) => setFilterServiceType(e.target.value as "all" | ServiceType)}
                  style={styles.select}
                >
                  <option value="all">Alle</option>
                  <option value="single">Enkelt</option>
                  <option value="subscription">Abonnement</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Status</label>
                <select
                  value={filterActiveStatus}
                  onChange={(e) => setFilterActiveStatus(e.target.value as "all" | "active" | "inactive")}
                  style={styles.select}
                >
                  <option value="all">Alle</option>
                  <option value="active">Aktive</option>
                  <option value="inactive">Kun i bero</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setFilterCustomerType("all");
                  setFilterServiceType("all");
                  setFilterActiveStatus("all");
                }}
                style={{ ...styles.smallBtn, marginLeft: 0 }}
              >
                Nulstil filtre
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
            {groupedSections.some((g) => g.count > 0) ? (
              groupedSections.map((group) => renderCustomerGroup(group))
            ) : (
              <div style={styles.emptyState}>Ingen kunder matcher filtrene.</div>
            )}
          </div>
        </div>
      </div>

      {noteModalCustomer ? (
        <div style={styles.modalOverlay} onClick={closeNoteModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTitle}>Kunde-note</div>
                <div style={styles.modalSubtitle}>{noteModalCustomer.name}</div>
              </div>

              <button type="button" onClick={closeNoteModal} style={styles.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={styles.label}>Note</label>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Fx kommentar fra bestilling, adgangsforhold eller særlige ønsker"
                style={styles.textarea}
                rows={6}
              />
            </div>

            <div style={styles.modalActions}>
              <button type="button" onClick={closeNoteModal} style={styles.modalBtnSecondary}>
                Luk
              </button>

              <button type="button" onClick={saveCustomerNote} disabled={noteSaving} style={styles.modalBtnPrimary}>
                {noteSaving ? "Gemmer..." : "Gem note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <NavTabs />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1180,
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
  h2: { fontSize: 30, margin: "0 0 12px" },
  h3: { margin: 0 },
  btn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #2a2a2a",
    background: "#171717",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  error: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #6b1b1b",
    background: "#2a0f0f",
    color: "#ffb4b4",
    whiteSpace: "pre-wrap",
  },

  card: {
    marginTop: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    background: "linear-gradient(180deg, rgba(18,18,18,0.95) 0%, rgba(10,10,10,0.92) 100%)",
    padding: 20,
    boxShadow: "0 14px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
  },

  searchPanel: {
    marginTop: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    background: "linear-gradient(180deg, rgba(16,16,16,0.95) 0%, rgba(10,10,10,0.92) 100%)",
    padding: 18,
    boxShadow: "0 14px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)",
    display: "grid",
    gap: 14,
  },

  listHeaderRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  customerCountPill: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(46,204,113,0.45)",
    background: "rgba(46,204,113,0.08)",
    color: "#dff7e8",
    fontSize: 13,
    fontWeight: 900,
  },

  sectionLabel: { fontWeight: 700, opacity: 0.95, marginBottom: 10 },
  label: { display: "block", marginBottom: 6, opacity: 0.9, fontSize: 13 },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #2e2e2e",
    background: "#171717",
    color: "#fff",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #2e2e2e",
    background: "#171717",
    color: "#fff",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #2e2e2e",
    background: "#171717",
    color: "#fff",
    outline: "none",
    resize: "vertical",
    minHeight: 96,
    fontFamily: "inherit",
  },
  searchInputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#141414",
    borderRadius: 16,
    padding: "0 12px",
    minHeight: 54,
  },
  searchIcon: {
    opacity: 0.78,
    fontSize: 20,
    lineHeight: 1,
  },
  searchInput: {
    width: "100%",
    height: 52,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#fff",
    fontSize: 16,
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
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
    borderRadius: 18,
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
    borderRadius: 16,
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
    borderRadius: 16,
    border: "1px solid #2f2f2f",
    background: "#323232",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },

  smallBtn: {
    padding: "8px 10px",
    borderRadius: 12,
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
    borderRadius: 12,
    border: "1px solid #2f2f2f",
    background: "#1a1a1a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },

  binLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "12px",
    border: "1px solid #262626",
    borderRadius: 14,
    background: "#141414",
    flexWrap: "wrap",
  },

  groupSection: {
    borderRadius: 24,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "linear-gradient(180deg, rgba(14,14,14,0.96) 0%, rgba(10,10,10,0.92) 100%)",
    boxShadow: "0 14px 36px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.02)",
  },
    groupHeaderBtn: {
    width: "100%",
    borderRadius: 18,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
    color: "#fff",
    background: "transparent",
  },
  groupHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  groupAccentBar: {
    width: 6,
    minWidth: 6,
    alignSelf: "stretch",
    borderRadius: 999,
  },
  groupTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  groupTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: -0.3,
    color: "#fff",
  },
  groupSubtitle: {
    marginTop: 4,
    fontSize: 13,
    opacity: 0.78,
    color: "#fff",
  },
  groupCountPill: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  groupChevron: {
    fontSize: 20,
    fontWeight: 900,
    opacity: 0.9,
    minWidth: 24,
    textAlign: "center",
    color: "#fff",
  },

  customerShell: {
    position: "relative",
    borderRadius: 22,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.07)",
    background:
      "radial-gradient(circle at top right, rgba(46,204,113,0.05), transparent 30%), linear-gradient(180deg, rgba(17,17,17,0.98) 0%, rgba(11,11,11,0.96) 100%)",
    boxShadow: "0 16px 42px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
    padding: 14,
  },
  customerShellGlow: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: "linear-gradient(180deg, rgba(255,255,255,0.018) 0%, rgba(255,255,255,0) 35%)",
  },
  customerCardTop: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  customerTopLine: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  customerName: {
    fontSize: 28,
    fontWeight: 950,
    lineHeight: 1.03,
    letterSpacing: -0.5,
  },
  customerTopBadges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  cardBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  cardBadgeMuted: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.04)",
    color: "#f1f1f1",
  },
  cardBadgeWarning: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
    border: "1px solid rgba(241,196,15,0.5)",
    background: "rgba(241,196,15,0.10)",
    color: "#fff0b3",
  },
  cardBadgeDanger: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
    border: "1px solid rgba(255,77,79,0.5)",
    background: "rgba(255,77,79,0.10)",
    color: "#ffd6d6",
  },
  cardBadgeNote: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
    border: "1px solid rgba(168,139,250,0.45)",
    background: "rgba(168,139,250,0.10)",
    color: "#efe3ff",
  },
  customerAddress: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 1.3,
    color: "rgba(255,255,255,0.9)",
  },
  customerContactRow: {
    marginTop: 8,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  contactText: {
    fontSize: 13,
    opacity: 0.88,
  },
  customerMetaRow: {
    marginTop: 10,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  binMiniBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(46,204,113,0.35)",
    background: "rgba(46,204,113,0.08)",
    color: "#dff7e8",
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  cardActionArea: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    maxWidth: "100%",
  },
  cardActionBtn: {
    padding: "8px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    minHeight: 38,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  cardActionBtnGreen: {
    border: "1px solid rgba(46,204,113,0.4)",
    background: "rgba(46,204,113,0.08)",
    color: "#dff7e8",
  },
  cardActionBtnBlue: {
    border: "1px solid rgba(78,161,255,0.4)",
    background: "rgba(78,161,255,0.08)",
    color: "#dbeeff",
  },
  cardActionBtnDanger: {
    border: "1px solid rgba(255,77,79,0.4)",
    background: "rgba(255,77,79,0.08)",
    color: "#ffd6d6",
  },
  cardIconBtn: {
    width: 38,
    height: 38,
    minWidth: 38,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 16,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardIconBtnNoteActive: {
    border: "1px solid rgba(168,139,250,0.45)",
    background: "rgba(168,139,250,0.10)",
    color: "#efe3ff",
  },
  cardExpandBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 16,
    lineHeight: 1,
  },
  emptyState: {
    opacity: 0.72,
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.62)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(18,18,18,0.98) 0%, rgba(10,10,10,0.96) 100%)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.03)",
    padding: 18,
    color: "#fff",
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 14,
    opacity: 0.78,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 16,
  },
  modalActions: {
    marginTop: 16,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  modalBtnSecondary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #2f2f2f",
    background: "#1a1a1a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  modalBtnPrimary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #a88bfa",
    background: "rgba(168,139,250,0.14)",
    color: "#efe3ff",
    cursor: "pointer",
    fontWeight: 900,
  },
};