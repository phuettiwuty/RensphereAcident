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
function fmtDateShort(d: string): string {
    try { return new Date(d).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }); } catch { return d; }
}

/* ================================================================
   Types
   ================================================================ */
interface PaymentRecord {
    id: string;
    invoiceNo: string;
    roomNo: string;
    tenantName: string;
    tenantAvatar: string;          // initials + bg colour token
    sentDate: string | null;       // null = not sent yet
    amount: number;
    status: "overdue" | "pending" | "paid";
    autoNotify: boolean;
}



/* ================================================================
   Status helpers
   ================================================================ */
function statusLabel(s: PaymentRecord["status"]) {
    switch (s) {
        case "overdue": return "ค้างชำระ";
        case "pending": return "ยังไม่ส่ง";
        case "paid": return "ชำระแล้ว";
    }
}
function statusClass(s: PaymentRecord["status"]) {
    switch (s) {
        case "overdue": return "bg-red-100 text-red-600 border-red-200";
        case "pending": return "bg-amber-100 text-amber-600 border-amber-200";
        case "paid": return "bg-green-100 text-green-600 border-green-200";
    }
}

/* ================================================================
   Main Page
   ================================================================ */
export default function PaymentsPage() {
    const [page, setPage] = useState(1);
    const [data, setData] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalRooms, setTotalRooms] = useState(0);
    const PER_PAGE = 4;

    const AVATAR_COLORS = ["bg-purple-400", "bg-blue-400", "bg-green-400", "bg-pink-400", "bg-amber-400", "bg-teal-400", "bg-indigo-400", "bg-rose-400"];

    /* ===== Load data from backend ===== */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const condoId = await resolveCondoId();

                // Fetch invoices + rooms + tenants in parallel
                const [invRes, roomRes, tenantRes, meterRes, utilRes] = await Promise.all([
                    fetch(`${API}/api/v1/condos/${condoId}/invoices`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/api/v1/condos/${condoId}/rooms`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/admin/tenants?condoId=${encodeURIComponent(condoId)}`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/api/v1/condos/${condoId}/meters`, { headers: authHeaders() }).catch(() => null),
                    fetch(`${API}/api/v1/condos/${condoId}/utilities`, { headers: authHeaders() }).catch(() => null),
                ]);

                const invoices: any[] = invRes?.ok ? (await invRes.json()).invoices || [] : [];
                const rooms: any[] = roomRes?.ok ? (await roomRes.json()).rooms || [] : [];
                const tenants: any[] = tenantRes?.ok ? (await tenantRes.json()).items || [] : [];
                const meters: any[] = meterRes?.ok ? (await meterRes.json()).meters || [] : [];
                const configs: any[] = utilRes?.ok ? (await utilRes.json()).configs || [] : [];

                if (cancelled) return;
                setTotalRooms(rooms.length);

                // Utility rates
                let waterRate = 18, electricRate = 8;
                for (const c of configs) {
                    if (c.utility_type === "water") waterRate = Number(c.rate || 18);
                    if (c.utility_type === "electricity") electricRate = Number(c.rate || 8);
                }

                // Tenant map: roomNo → tenantName
                const tenantMap: Record<string, string> = {};
                for (const t of tenants) {
                    const roomNo = String(t.room_no || t.roomNo || t.room || "");
                    const name = t.full_name || t.fullName || "";
                    if (roomNo && name) tenantMap[roomNo] = name;
                }

                // Room map: roomId → roomNo/price
                const roomMap: Record<string, { roomNo: string; price: number }> = {};
                for (const r of rooms) roomMap[String(r.id)] = { roomNo: String(r.roomNo || r.room_no || "—"), price: Number(r.price || 0) };

                // Meter costs per room
                const meterCosts: Record<string, { water: number; electric: number }> = {};
                for (const m of meters) {
                    const rid = String(m.roomId || ""); if (!rid) continue;
                    if (!meterCosts[rid]) meterCosts[rid] = { water: 0, electric: 0 };
                    const units = Number(m.unitsUsed ?? 0);
                    if (m.type === "water") meterCosts[rid].water = Math.max(meterCosts[rid].water, units * waterRate);
                    else if (m.type === "electricity") meterCosts[rid].electric = Math.max(meterCosts[rid].electric, units * electricRate);
                }

                const records: PaymentRecord[] = [];

                if (invoices.length > 0) {
                    for (const inv of invoices) {
                        const roomId = String(inv.roomId || inv.room_id || "");
                        const room = roomMap[roomId];
                        const rNo = room?.roomNo || inv.roomNo || "—";
                        const tenant = tenantMap[rNo] || "—";
                        let status: PaymentRecord["status"] = "pending";
                        const s = String(inv.status || "").toLowerCase();
                        if (s === "paid") status = "paid";
                        else if (s === "overdue") status = "overdue";
                        else if (inv.dueDate && new Date(inv.dueDate) < new Date()) status = "overdue";

                        records.push({
                            id: String(inv.id),
                            invoiceNo: `INV-${String(inv.id).slice(-6).toUpperCase()}`,
                            roomNo: rNo,
                            tenantName: tenant,
                            tenantAvatar: tenant.slice(0, 2).toUpperCase(),
                            sentDate: inv.createdAt ? fmtDateShort(inv.createdAt) : null,
                            amount: Number(inv.totalAmount ?? inv.total_amount ?? 0),
                            status,
                            autoNotify: status === "overdue",
                        });
                    }
                } else {
                    // Draft จากข้อมูล room + meter
                    for (const r of rooms) {
                        const rid = String(r.id);
                        const rNo = String(r.roomNo || r.room_no || "—");
                        const tenant = tenantMap[rNo];
                        if (!tenant) continue;
                        const mc = meterCosts[rid] || { water: 0, electric: 0 };
                        const total = Number(r.price || 0) + mc.water + mc.electric;
                        if (total <= 0) continue;
                        records.push({
                            id: rid, invoiceNo: `DRAFT-${rNo}`, roomNo: rNo,
                            tenantName: tenant, tenantAvatar: tenant.slice(0, 2).toUpperCase(),
                            sentDate: null, amount: total, status: "pending", autoNotify: false,
                        });
                    }
                }

                setData(records);
            } catch (e) { console.error("PaymentsPage load error:", e); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    /* ===== Derived stats ===== */
    const TOTAL_AMOUNT = useMemo(() => data.reduce((s, r) => s + r.amount, 0), [data]);
    const PAID_AMOUNT = useMemo(() => data.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0), [data]);
    const UNPAID_AMOUNT = useMemo(() => data.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0), [data]);
    const TOTAL_ROOMS = totalRooms;
    const UNPAID_ROOMS = useMemo(() => new Set(data.filter(r => r.status !== "paid").map(r => r.roomNo)).size, [data]);

    const totalPages = Math.max(1, Math.ceil(data.length / PER_PAGE));
    const pageData = data.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const startIdx = (page - 1) * PER_PAGE + 1;
    const endIdx = Math.min(page * PER_PAGE, data.length);

    const handleToggle = (id: string) => {
        setData((prev) =>
            prev.map((r) => (r.id === id ? { ...r, autoNotify: !r.autoNotify } : r))
        );
    };

    const paidPct = TOTAL_AMOUNT > 0 ? Math.round((PAID_AMOUNT / TOTAL_AMOUNT) * 100) : 0;

    // Current month/year in Thai
    const currentMonthYear = useMemo(() => new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", month: "long", year: "numeric" }), []);

    if (loading) {
        return (
            <OwnerShell activeKey="payments">
                <div className="w-full mx-auto pt-6 px-8 pb-10">
                    <div className="rounded-2xl bg-white border border-blue-100 shadow-sm px-6 py-12 text-center">
                        <div className="text-sm font-extrabold text-gray-600">กำลังโหลดข้อมูลการชำระเงิน...</div>
                    </div>
                </div>
            </OwnerShell>
        );
    }

    return (
        <OwnerShell activeKey="payments">
            <div className="w-full mx-auto animate-in fade-in duration-300 pt-6 px-8 pb-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">ติดตามการชำระเงิน</h1>
                        <p className="text-sm font-bold text-gray-500 mt-1 pt-1">
                            ภาพรวมสถานะการชำระเงินประจำเดือน {currentMonthYear}
                        </p>
                    </div>
                    <button className="h-[40px] px-5 rounded-lg bg-[#93C5FD] text-white font-extrabold text-sm shadow-[0_8px_20px_rgba(147,197,253,0.4)] hover:bg-[#7fb4fb] active:scale-[0.98] transition flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        ตั้งค่าแจ้งเตือนอัตโนมัติ
                    </button>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                    {/* ยอดรวมทั้งหมด */}
                    <div className="rounded-2xl bg-white border border-blue-100 px-6 py-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-[#93C5FD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ยอดรวมทั้งหมด</span>
                        </div>
                        <p className="text-3xl font-black text-gray-900 tracking-tight">{TOTAL_AMOUNT.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs font-bold text-gray-400 mt-1">จากทั้งหมด {TOTAL_ROOMS} ห้อง</p>
                    </div>

                    {/* ชำระแล้ว */}
                    <div className="rounded-2xl bg-white border border-green-100 px-6 py-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ชำระแล้ว</span>
                        </div>
                        <p className="text-3xl font-black text-green-600 tracking-tight">{PAID_AMOUNT.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                        {/* Progress bar */}
                        <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${paidPct}%` }} />
                            </div>
                            <span className="text-xs font-extrabold text-green-600">{paidPct}%</span>
                        </div>
                    </div>

                    {/* ยังไม่ชำระ */}
                    <div className="rounded-2xl bg-white border border-red-100 px-6 py-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ยังไม่ชำระ</span>
                        </div>
                        <p className="text-3xl font-black text-red-500 tracking-tight">{UNPAID_AMOUNT.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs font-bold text-gray-400 mt-1">จำนวน {UNPAID_ROOMS} ห้องที่ยังค้างจ่าย</p>
                    </div>
                </div>

                {/* Table card */}
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="py-4 px-4 text-left font-extrabold text-gray-500 text-xs uppercase tracking-wider w-10">#</th>
                                <th className="py-4 px-4 text-left font-extrabold text-gray-500 text-xs uppercase tracking-wider">เลขใบแจ้งหนี้</th>
                                <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">ห้อง</th>
                                <th className="py-4 px-4 text-left font-extrabold text-gray-500 text-xs uppercase tracking-wider">ผู้เช่า</th>
                                <th className="py-4 px-4 text-right font-extrabold text-gray-500 text-xs uppercase tracking-wider">ยอดค้าง</th>
                                <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">สถานะ</th>
                                <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">AUTO-NOTIFY</th>
                                <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">การจัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageData.map((r, idx) => (
                                <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition">
                                    {/* # */}
                                    <td className="py-5 px-4 font-bold text-gray-400">{startIdx + idx}</td>

                                    {/* เลขใบแจ้งหนี้ */}
                                    <td className="py-5 px-4 font-bold text-gray-700">{r.invoiceNo}</td>

                                    {/* ห้อง */}
                                    <td className="py-5 px-4 text-center font-extrabold text-gray-900">{r.roomNo}</td>

                                    {/* ผู้เช่า */}
                                    <td className="py-5 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-9 w-9 rounded-full ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-extrabold shrink-0`}>
                                                {r.tenantAvatar}
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-gray-900 text-sm">{r.tenantName}</p>
                                                {r.sentDate && (
                                                    <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1 mt-0.5">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        {r.sentDate}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* ยอดค้าง */}
                                    <td className={`py-5 px-4 text-right font-extrabold ${r.amount > 0 ? "text-red-500" : "text-gray-400"}`}>
                                        {r.amount > 0 ? r.amount.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00"}
                                    </td>

                                    {/* สถานะ */}
                                    <td className="py-5 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold border ${statusClass(r.status)}`}>
                                            {statusLabel(r.status)}
                                        </span>
                                    </td>

                                    {/* AUTO-NOTIFY toggle */}
                                    <td className="py-5 px-4 text-center">
                                        <button
                                            onClick={() => handleToggle(r.id)}
                                            aria-label="เปิด/ปิดแจ้งเตือนอัตโนมัติ"
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${r.autoNotify ? "bg-[#93C5FD]" : "bg-gray-200"}`}
                                        >
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${r.autoNotify ? "translate-x-6" : "translate-x-1"}`} />
                                        </button>
                                    </td>

                                    {/* การจัดการ */}
                                    <td className="py-5 px-4 text-center">
                                        {r.status === "overdue" && r.autoNotify ? (
                                            <button className="px-3 py-1.5 rounded-lg bg-blue-100 text-[#93C5FD] text-xs font-extrabold hover:bg-blue-200 transition">
                                                แจ้งเตือนซ้ำ
                                            </button>
                                        ) : r.status === "pending" ? (
                                            <button className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 text-xs font-extrabold hover:bg-blue-200 transition">
                                                แจ้งค้างชำระ
                                            </button>
                                        ) : (
                                            <button aria-label="ดูรายละเอียด" className="text-gray-400 hover:text-[#93C5FD] transition">
                                                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}

                            {pageData.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center text-gray-400 font-bold">
                                        ไม่พบข้อมูลการชำระเงิน
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                        <p className="text-sm font-bold text-gray-400">
                            แสดง {startIdx} ถึง {endIdx} จาก {data.length} รายการ
                        </p>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    aria-label="หน้าก่อนหน้า"
                                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 disabled:opacity-40 transition"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPage(p)}
                                        className={[
                                            "w-8 h-8 rounded-lg font-extrabold text-sm transition",
                                            page === p
                                                ? "bg-[#93C5FD] text-white shadow-md"
                                                : "bg-white border border-gray-200 text-gray-600 hover:bg-blue-50",
                                        ].join(" ")}
                                    >
                                        {p}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    disabled={page === totalPages}
                                    aria-label="หน้าถัดไป"
                                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 disabled:opacity-40 transition"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </OwnerShell>
    );
}
