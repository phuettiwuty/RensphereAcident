import { useEffect, useMemo, useState } from "react";
import OwnerShell from "@/features/owner/components/OwnerShell";

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
    const ls = localStorage.getItem("rentsphere_selected_condo"); if (ls) return ls;
    try { const raw = localStorage.getItem("rentsphere_condo_wizard"); if (raw) { const id = JSON.parse(raw)?.state?.condoId; if (id) return id; } } catch { }
    try { const r = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() }); if (r.ok) { const d = await r.json(); const c = d.condo || (d.condos && d.condos[0]); if (c?.id) return String(c.id); } } catch { }
    throw new Error("ไม่พบ condoId");
}

/* ================================================================
   Types
   ================================================================ */
interface BillingRecord {
    id: string;
    invoiceNo: string;
    roomNo: string;
    waterFee: number;
    electricFee: number;
    rentFee: number;
    otherFee: number;
    totalFee: number;
    unpaidAmount: number; // 0 if paid
    status: "paid" | "pending" | "overdue";
    date: string;
}



/* ================================================================
   Main Page
   ================================================================ */
export default function ReportsPage() {
    const [billingData, setBillingData] = useState<BillingRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [roomCount, setRoomCount] = useState(0);
    const PER_PAGE = 6;

    /* ===== Load data from backend ===== */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const condoId = await resolveCondoId();

                const [invRes, roomRes, meterRes, utilRes] = await Promise.all([
                    fetch(`${API}/api/v1/condos/${condoId}/invoices`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/api/v1/condos/${condoId}/rooms`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/api/v1/condos/${condoId}/meters`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/api/v1/condos/${condoId}/utilities`, { headers: authHeaders() }).catch(() => null),
                ]);

                const invoices: any[] = invRes?.ok ? (await invRes.json()).invoices || [] : [];
                const rooms: any[] = roomRes?.ok ? (await roomRes.json()).rooms || [] : [];
                const meters: any[] = meterRes?.ok ? (await meterRes.json()).meters || [] : [];
                const configs: any[] = utilRes?.ok ? (await utilRes.json()).configs || [] : [];

                if (cancelled) return;
                setRoomCount(rooms.length);

                // Utility rates
                let waterRate = 18, electricRate = 8;
                for (const c of configs) {
                    if (c.utility_type === "water") waterRate = Number(c.rate || 18);
                    if (c.utility_type === "electricity") electricRate = Number(c.rate || 8);
                }

                // Room map
                const roomMap: Record<string, { roomNo: string; price: number }> = {};
                for (const r of rooms) roomMap[String(r.id)] = { roomNo: String(r.roomNo || r.room_no || "—"), price: Number(r.price || 0) };

                // Latest meter per room
                const meterCosts: Record<string, { water: number; waterFee: number; electric: number; electricFee: number }> = {};
                for (const m of meters) {
                    const rid = String(m.roomId || ""); if (!rid) continue;
                    if (!meterCosts[rid]) meterCosts[rid] = { water: 0, waterFee: 0, electric: 0, electricFee: 0 };
                    const units = Number(m.unitsUsed ?? 0);
                    if (m.type === "water") {
                        meterCosts[rid].water = Math.max(meterCosts[rid].water, units);
                        meterCosts[rid].waterFee = Math.max(meterCosts[rid].waterFee, units * waterRate);
                    } else if (m.type === "electricity") {
                        meterCosts[rid].electric = Math.max(meterCosts[rid].electric, units);
                        meterCosts[rid].electricFee = Math.max(meterCosts[rid].electricFee, units * electricRate);
                    }
                }

                const records: BillingRecord[] = [];

                if (invoices.length > 0) {
                    // Build from invoices
                    for (const inv of invoices) {
                        const roomId = String(inv.roomId || inv.room_id || "");
                        const room = roomMap[roomId];
                        const rNo = room?.roomNo || "—";
                        const mc = meterCosts[roomId] || { waterFee: 0, electricFee: 0 };
                        const rentFee = room?.price || 0;
                        const totalAmount = Number(inv.totalAmount ?? inv.total_amount ?? 0);
                        const otherFee = Math.max(0, totalAmount - rentFee - mc.waterFee - mc.electricFee);

                        let status: BillingRecord["status"] = "pending";
                        const s = String(inv.status || "").toLowerCase();
                        if (s === "paid") status = "paid";
                        else if (s === "overdue") status = "overdue";
                        else if (inv.dueDate && new Date(inv.dueDate) < new Date()) status = "overdue";

                        records.push({
                            id: String(inv.id),
                            invoiceNo: `INV-${String(inv.id).slice(-6).toUpperCase()}`,
                            roomNo: rNo,
                            rentFee,
                            waterFee: mc.waterFee,
                            electricFee: mc.electricFee,
                            otherFee,
                            totalFee: totalAmount,
                            unpaidAmount: status !== "paid" ? totalAmount : 0,
                            status,
                            date: inv.createdAt || inv.created_at || "",
                        });
                    }
                } else {
                    // Build from rooms + meters (draft / no invoices yet)
                    for (const r of rooms) {
                        const rid = String(r.id);
                        const rNo = String(r.roomNo || r.room_no || "—");
                        const rentFee = Number(r.price || 0);
                        const mc = meterCosts[rid] || { waterFee: 0, electricFee: 0 };
                        const totalFee = rentFee + mc.waterFee + mc.electricFee;
                        if (totalFee <= 0) continue;

                        records.push({
                            id: rid,
                            invoiceNo: `DRAFT-${rNo}`,
                            roomNo: rNo,
                            rentFee,
                            waterFee: mc.waterFee,
                            electricFee: mc.electricFee,
                            otherFee: 0,
                            totalFee,
                            unpaidAmount: totalFee,
                            status: "pending",
                            date: new Date().toISOString(),
                        });
                    }
                }

                // Sort by roomNo
                records.sort((a, b) => a.roomNo.localeCompare(b.roomNo, "th", { numeric: true }));
                setBillingData(records);
            } catch (e) { console.error("ReportsPage load error:", e); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    /* ===== Derived summary ===== */
    const SUMMARY = useMemo(() => {
        const totalAmount = billingData.reduce((s, r) => s + r.totalFee, 0);
        const paidAmount = billingData.filter(r => r.status === "paid").reduce((s, r) => s + r.totalFee, 0);
        const unpaidAmount = billingData.filter(r => r.status !== "paid").reduce((s, r) => s + r.unpaidAmount, 0);
        return { totalAmount, paidAmount, unpaidAmount, roomCount };
    }, [billingData, roomCount]);

    const totalPages = Math.max(1, Math.ceil(billingData.length / PER_PAGE));
    const pageData = billingData.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const startIdx = (page - 1) * PER_PAGE + 1;
    const endIdx = Math.min(page * PER_PAGE, billingData.length);

    /* Totals for footer */
    const pageTotals = useMemo(() => {
        return pageData.reduce(
            (acc, r) => ({
                rent: acc.rent + r.rentFee,
                water: acc.water + r.waterFee,
                electric: acc.electric + r.electricFee,
                other: acc.other + r.otherFee,
                unpaid: acc.unpaid + r.unpaidAmount,
                total: acc.total + r.totalFee,
            }),
            { rent: 0, water: 0, electric: 0, other: 0, unpaid: 0, total: 0 }
        );
    }, [pageData]);

    // Current month/year in Thai
    const currentMonthYear = useMemo(() => new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", month: "long", year: "numeric" }), []);

    if (loading) {
        return (
            <OwnerShell activeKey="reports">
                <div className="min-h-screen w-full bg-gradient-to-b from-[#EAF2FF] to-[#f8faff] p-8 pb-12">
                    <div className="rounded-2xl bg-white border border-blue-100 shadow-sm px-6 py-12 text-center">
                        <div className="text-sm font-extrabold text-gray-600">กำลังโหลดข้อมูลรายงาน...</div>
                    </div>
                </div>
            </OwnerShell>
        );
    }

    return (
        <OwnerShell activeKey="reports">
            {/* Background wrapper with gradient to match style but keep blue theme */}
            <div className="min-h-screen w-full bg-gradient-to-b from-[#EAF2FF] to-[#f8faff] p-8 pb-12">

                {/* 1. Header Section */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">รายงานบิลรายเดือน</h1>
                        <p className="text-sm font-bold text-gray-500 mt-1">
                            สรุปรายละเอียดค่าเช่าและค่าใช้จ่ายประจำเดือน {currentMonthYear}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="h-[40px] px-4 rounded-lg bg-white border border-gray-200 text-gray-600 font-extrabold text-sm hover:bg-gray-50 active:scale-[0.98] transition flex items-center gap-2 shadow-sm">
                            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            Export PDF
                        </button>
                        <button className="h-[40px] px-4 rounded-lg bg-white border border-gray-200 text-gray-600 font-extrabold text-sm hover:bg-gray-50 active:scale-[0.98] transition flex items-center gap-2 shadow-sm">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Export Excel
                        </button>
                        <button aria-label="พิมพ์" className="h-[40px] w-[40px] rounded-lg bg-[#93C5FD] text-white flex items-center justify-center shadow-lg shadow-blue-200 hover:bg-[#7fb4fb] active:scale-[0.98] transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                    </div>
                </div>

                {/* 2. Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* ยอดรวมทั้งหมด */}
                    <div className="rounded-2xl bg-white p-6 shadow-sm border border-blue-50">
                        <p className="text-xs font-bold text-gray-500 mb-2">ยอดรวมทั้งหมด</p>
                        <p className="text-2xl font-black text-gray-900">฿ {SUMMARY.totalAmount.toLocaleString()}</p>
                    </div>

                    {/* ชำระแล้ว */}
                    <div className="rounded-2xl bg-white p-6 shadow-sm border border-blue-50">
                        <p className="text-xs font-bold text-gray-500 mb-2">ชำระแล้ว</p>
                        <p className="text-2xl font-black text-green-600">฿ {SUMMARY.paidAmount.toLocaleString()}</p>
                    </div>

                    {/* ค้างชำระ */}
                    <div className="rounded-2xl bg-white p-6 shadow-sm border border-blue-50">
                        <p className="text-xs font-bold text-gray-500 mb-2">ค้างชำระ</p>
                        <p className="text-2xl font-black text-red-500">฿ {SUMMARY.unpaidAmount.toLocaleString()}</p>
                    </div>

                    {/* จำนวนห้อง */}
                    <div className="rounded-2xl bg-white p-6 shadow-sm border border-blue-50">
                        <p className="text-xs font-bold text-gray-500 mb-2">จำนวนห้อง</p>
                        <p className="text-2xl font-black text-gray-900">{SUMMARY.roomCount} <span className="text-lg font-bold text-gray-500 text-sm">ห้อง</span></p>
                    </div>
                </div>

                {/* 3. Table Card */}
                <div className="rounded-3xl bg-white shadow-sm overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-[#f9fafb]">
                                    <th className="py-5 px-6 text-left font-bold text-gray-500 w-[80px]">ห้อง</th>
                                    <th className="py-5 px-6 text-left font-bold text-gray-500">ใบแจ้งหนี้</th>
                                    <th className="py-5 px-6 text-right font-bold text-gray-500">ค่าห้อง</th>
                                    <th className="py-5 px-6 text-right font-bold text-gray-500">ค่าน้ำ</th>
                                    <th className="py-5 px-6 text-right font-bold text-gray-500">ค่าไฟ</th>
                                    <th className="py-5 px-6 text-right font-bold text-gray-500">อื่นๆ</th>
                                    <th className="py-5 px-6 text-right font-bold text-gray-500">ค้างชำระ</th>
                                    <th className="py-5 px-6 text-right font-bold text-gray-500">รวม</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageData.map((r, idx) => (
                                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition ${idx % 2 === 0 ? "bg-white" : "bg-[#fcfdff]"}`}>
                                        <td className="py-5 px-6 font-black text-gray-900">{r.roomNo}</td>
                                        <td className="py-5 px-6 font-bold text-gray-400">{r.invoiceNo}</td>
                                        <td className="py-5 px-6 text-right font-medium text-gray-500">
                                            {r.rentFee > 0 ? r.rentFee.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}
                                        </td>
                                        <td className="py-5 px-6 text-right font-medium text-gray-500">
                                            {r.waterFee > 0 ? r.waterFee.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}
                                        </td>
                                        <td className="py-5 px-6 text-right font-medium text-gray-500">
                                            {r.electricFee > 0 ? r.electricFee.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}
                                        </td>
                                        <td className="py-5 px-6 text-right font-medium text-gray-500">
                                            {r.otherFee > 0 ? r.otherFee.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}
                                        </td>
                                        <td className={`py-5 px-6 text-right font-bold ${r.unpaidAmount > 0 ? "text-red-500" : "text-gray-400"}`}>
                                            {r.unpaidAmount > 0 ? r.unpaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}
                                        </td>
                                        <td className="py-5 px-6 text-right font-extrabold text-gray-900">
                                            {r.totalFee > 0 ? r.totalFee.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-[#f9fafb]">
                                <tr>
                                    <td colSpan={2} className="py-5 px-6 text-right font-extrabold text-gray-900">ยอดรวมประจำหน้า:</td>
                                    <td className="py-5 px-6 text-right font-bold text-gray-900">{pageTotals.rent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-5 px-6 text-right font-bold text-gray-900">{pageTotals.water.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-5 px-6 text-right font-bold text-gray-900">{pageTotals.electric.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-5 px-6 text-right font-bold text-gray-900">{pageTotals.other.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-5 px-6 text-right font-bold text-red-500">{pageTotals.unpaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-5 px-6 text-right font-extrabold text-[#93C5FD]">{pageTotals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* 4. Footer Pagination */}
                    <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4">
                        <p className="text-sm font-bold text-gray-500 mb-4 md:mb-0">
                            กำลังแสดง {startIdx} ถึง {endIdx} จาก {billingData.length} รายการ
                        </p>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(Math.max(1, page - 1))}
                                disabled={page === 1}
                                aria-label="หน้าก่อนหน้า"
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#EAF2FF] text-gray-600 hover:bg-blue-100 disabled:opacity-50 transition"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-8 h-8 rounded-lg font-bold text-sm transition ${page === p
                                        ? "bg-[#93C5FD] text-white shadow-lg shadow-blue-200"
                                        : "bg-[#EAF2FF] text-gray-600 hover:bg-blue-100"
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}

                            <button
                                onClick={() => setPage(Math.min(totalPages, page + 1))}
                                disabled={page === totalPages}
                                aria-label="หน้าถัดไป"
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#EAF2FF] text-gray-600 hover:bg-blue-100 disabled:opacity-50 transition"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </OwnerShell>
    );
}
