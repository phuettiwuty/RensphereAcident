import { useEffect, useState } from "react";
import OwnerShell from "@/features/owner/components/OwnerShell";
import BillingFilter from "./componentsbill/BillingFilter";
import BillingTable from "./componentsbill/BillingTable";
import InvoiceDetail from "./InvoiceDetail";
import type { BillingItem } from "./types";
import { getSelectedCondoId } from "@/features/owner/stores/condoStore";

/* ================================================================
   API helpers
   ================================================================ */
const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function getAuthToken(): string {
  try { const raw = localStorage.getItem("rentsphere_auth"); if (!raw) return ""; return JSON.parse(raw)?.state?.token || ""; } catch { return ""; }
}
function authHeaders() {
  const t = getAuthToken();
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
async function resolveCondoId(): Promise<string> {
  const storeId = getSelectedCondoId(); if (storeId) return storeId;
  const ls = localStorage.getItem("rentsphere_selected_condo"); if (ls) return ls;
  try { const raw = localStorage.getItem("rentsphere_condo_wizard"); if (raw) { const id = JSON.parse(raw)?.state?.condoId; if (id) return id; } } catch { }
  try { const r = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() }); if (r.ok) { const d = await r.json(); const c = d.condo || (d.condos && d.condos[0]); if (c?.id) return String(c.id); } } catch { }
  throw new Error("ไม่พบ condoId");
}

/* ================================================================
   Main Page
   ================================================================ */
export default function BillingPage() {
  /* ==================== state ==================== */
  const [billingData, setBillingData] = useState<BillingItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<BillingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [waterRate, setWaterRate] = useState(18);
  const [electricRate, setElectricRate] = useState(8);
  const [condoId, setCondoId] = useState("");

  /* ==================== load data from backend ==================== */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const cId = await resolveCondoId();
        if (cancelled) return;
        setCondoId(cId);

        // Fetch rooms, meters, utilities, tenants, invoices in parallel
        const [roomRes, meterRes, utilRes, tenantRes, invRes] = await Promise.all([
          fetch(`${API}/api/v1/condos/${cId}/rooms`, { headers: authHeaders() }).catch(() => null),
          fetch(`${API}/api/v1/condos/${cId}/meters`, { headers: authHeaders() }).catch(() => null),
          fetch(`${API}/api/v1/condos/${cId}/utilities`, { headers: authHeaders() }).catch(() => null),
          fetch(`${API}/admin/tenants?condoId=${encodeURIComponent(cId)}`, { headers: authHeaders() }).catch(() => null),
          fetch(`${API}/api/v1/condos/${cId}/invoices`, { headers: authHeaders() }).catch(() => null),
        ]);

        const rooms: any[] = roomRes?.ok ? (await roomRes.json()).rooms || [] : [];
        const meters: any[] = meterRes?.ok ? (await meterRes.json()).meters || [] : [];
        const configs: any[] = utilRes?.ok ? (await utilRes.json()).configs || [] : [];
        const tenants: any[] = tenantRes?.ok ? (await tenantRes.json()).items || [] : [];
        const invoices: any[] = invRes?.ok ? (await invRes.json()).invoices || [] : [];
        if (cancelled) return;

        // Utility rates
        let wRate = 18, eRate = 8;
        for (const c of configs) {
          if (c.utility_type === "water") wRate = Number(c.rate || 18);
          if (c.utility_type === "electricity") eRate = Number(c.rate || 8);
        }
        setWaterRate(wRate);
        setElectricRate(eRate);

        // Tenant map: roomNo → tenantName
        const tenantMap: Record<string, string> = {};
        for (const t of tenants) {
          const roomNo = String(t.room_no || t.roomNo || t.room || "");
          const name = t.full_name || t.fullName || "";
          if (roomNo && name) tenantMap[roomNo] = name;
        }

        // Invoice map: roomId → invoice
        const invoiceMap: Record<string, any> = {};
        for (const inv of invoices) {
          const rid = String(inv.room_id || inv.roomId || "");
          if (rid) invoiceMap[rid] = inv;
        }

        // Build latest meter data per room (keep latest by recorded_at)
        const meterMap: Record<string, { water?: any; electric?: any }> = {};
        for (const m of meters) {
          const rid = String(m.roomId || "");
          if (!rid) continue;
          if (!meterMap[rid]) meterMap[rid] = {};
          if (m.type === "water") {
            if (!meterMap[rid].water || new Date(m.recordedAt || 0) > new Date(meterMap[rid].water.recordedAt || 0)) {
              meterMap[rid].water = m;
            }
          } else if (m.type === "electricity") {
            if (!meterMap[rid].electric || new Date(m.recordedAt || 0) > new Date(meterMap[rid].electric.recordedAt || 0)) {
              meterMap[rid].electric = m;
            }
          }
        }

        // Build BillingItem[] from rooms
        const items: BillingItem[] = rooms.map((r) => {
          const roomId = String(r.id);
          const roomNo = String(r.roomNo || r.room_no || "—");
          const tenant = tenantMap[roomNo] || "";
          const isOccupied = !!tenant;
          const rentAmount = Number(r.price || 0);

          const wm = meterMap[roomId]?.water;
          const em = meterMap[roomId]?.electric;

          const waterMeter = wm ? {
            current: Number(wm.currentReading ?? 0),
            previous: Number(wm.previousReading ?? 0),
            totalUnits: Number(wm.unitsUsed ?? 0),
          } : undefined;

          const elecMeter = em ? {
            current: Number(em.currentReading ?? 0),
            previous: Number(em.previousReading ?? 0),
            totalUnits: Number(em.unitsUsed ?? 0),
          } : undefined;

          const waterCost = waterMeter ? waterMeter.totalUnits * wRate : 0;
          const elecCost = elecMeter ? elecMeter.totalUnits * eRate : 0;
          const estimatedTotal = rentAmount + waterCost + elecCost;

          // Check if invoice already exists for this room
          const inv = invoiceMap[roomId];
          const isPaid = inv ? String(inv.status || "").toLowerCase() === "paid" : false;

          return {
            id: roomId,
            roomNumber: roomNo,
            status: isOccupied ? "ไม่ว่าง" as const : "ว่าง" as const,
            waterMeter,
            elecMeter,
            rentAmount,
            estimatedTotal,
            isPaid,
            waterRate: wRate,
            electricRate: eRate,
            invoiceId: inv?.id ? String(inv.id) : undefined,
            tenantName: tenant || undefined,
            invoiceDate: wm?.recordedAt || em?.recordedAt || undefined,
          };
        });

        // Sort by roomNo
        items.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, "th", { numeric: true }));
        setBillingData(items);
      } catch (e) {
        console.error("BillingPage load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ==================== handlers ==================== */
  const handleCompletePayment = async (id: string) => {
    // Find the item
    const item = billingData.find((b) => b.id === id);
    if (!item || !condoId) { setSelectedItem(null); return; }

    try {
      if (item.invoiceId) {
        // PATCH existing invoice to paid
        await fetch(`${API}/api/v1/condos/${condoId}/invoices/${item.invoiceId}/pay`, {
          method: "PATCH", headers: authHeaders(),
        });
      } else {
        // POST new invoice + mark paid
        const res = await fetch(`${API}/api/v1/condos/${condoId}/invoices`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({
            roomId: item.id,
            totalAmount: item.estimatedTotal,
            status: "PAID",
            note: `ค่าเช่า ${item.rentAmount}฿ + ค่าน้ำ ${(item.waterMeter?.totalUnits || 0) * item.waterRate}฿ + ค่าไฟ ${(item.elecMeter?.totalUnits || 0) * item.electricRate}฿`,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          // Update invoiceId
          setBillingData((prev) =>
            prev.map((b) =>
              b.id === id ? { ...b, isPaid: true, invoiceId: d.invoice?.id ? String(d.invoice.id) : b.invoiceId } : b
            )
          );
          setSelectedItem(null);
          return;
        }
      }
    } catch (e) {
      console.error("Payment error:", e);
    }

    setBillingData((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isPaid: true } : b))
    );
    setSelectedItem(null);
  };

  /* ==================== search filter ==================== */
  const filteredData = search.trim()
    ? billingData.filter((b) => b.roomNumber.toLowerCase().includes(search.trim().toLowerCase()))
    : billingData;

  /* ==================== loading ==================== */
  if (loading) {
    return (
      <OwnerShell activeKey="billing" showSidebar>
        <div className="max-w-7xl mx-auto pt-10 px-6">
          <div className="rounded-2xl bg-white border border-purple-100 shadow-sm px-6 py-12 text-center">
            <div className="text-sm font-extrabold text-gray-600">กำลังโหลดข้อมูลใบแจ้งหนี้...</div>
          </div>
        </div>
      </OwnerShell>
    );
  }

  /* ==================== invoice detail ==================== */
  if (selectedItem) {
    return (
      <OwnerShell activeKey="billing" showSidebar>
        <div className="max-w-7xl mx-auto pt-10 px-6">
          <InvoiceDetail
            item={selectedItem}
            onBack={() => setSelectedItem(null)}
            onComplete={() => handleCompletePayment(selectedItem.id)}
            condoId={condoId}
          />
        </div>
      </OwnerShell>
    );
  }

  /* ==================== billing list ==================== */
  return (
    <OwnerShell activeKey="billing" showSidebar>
      <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pt-10 px-6">

        {/* ===== Stepper ===== */}
        <div className="flex justify-center items-center mb-12">
          <div className="flex items-center w-full max-w-xl">
            {/* Step 1 */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center mb-2">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-gray-500 text-sm font-medium">1. เลือกวันจดมิเตอร์</span>
            </div>
            <div className="flex-grow h-[1px] bg-gray-200 mx-4 -mt-7" />
            {/* Step 2 */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center mb-2 text-white font-bold">2</div>
              <span className="text-purple-600 text-sm font-bold">2. สร้างใบแจ้งหนี้</span>
            </div>
          </div>
        </div>

        {/* ===== Search Bar ===== */}
        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="ค้นหาเลขห้อง"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white rounded-2xl border-0 py-4 pl-12 pr-4 shadow-sm focus:ring-1 focus:ring-purple-400 focus:outline-none text-gray-600"
          />
        </div>

        {/* ===== Filters ===== */}
        <BillingFilter waterRate={waterRate} electricRate={electricRate} />

        {/* ===== Table ===== */}
        <BillingTable
          data={filteredData}
          onSelect={(item) => {
            // ถ้ามี invoice เดิมที่ paid แล้ว → สร้างใหม่ (ล้าง invoiceId)
            if (item.isPaid) {
              setSelectedItem({ ...item, invoiceId: undefined, isPaid: false });
            } else {
              setSelectedItem(item);
            }
          }}
        />
      </div>
    </OwnerShell>
  );
}
