import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OwnerShell from "@/features/owner/components/OwnerShell";
import waterIcon from "@/assets/brand/Container copy.png";
import electricIcon from "@/assets/brand/Container (1).png";

/* ================================================================
   API helpers  (ตรงกับ backend index.js)
   ================================================================ */
const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function getAuthToken(): string {
    try {
        const raw = localStorage.getItem("rentsphere_auth");
        if (!raw) return "";
        return JSON.parse(raw)?.state?.token || "";
    } catch { return ""; }
}

function authHeaders() {
    const token = getAuthToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function resolveCondoId(): Promise<string> {
    const lsCondoId = localStorage.getItem("rentsphere_selected_condo");
    if (lsCondoId) return lsCondoId;
    try {
        const raw = localStorage.getItem("rentsphere_condo_wizard");
        if (raw) { const id = JSON.parse(raw)?.state?.condoId; if (id) return id; }
    } catch { }
    try {
        const res = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() });
        if (res.ok) {
            const d = await res.json();
            const c = d.condo || (d.condos && d.condos[0]);
            if (c?.id) return String(c.id);
        }
    } catch { }
    throw new Error("ไม่พบ condoId");
}

/* ================================================================
   Types
   ================================================================ */
type MeterType = "water" | "electric";

interface RoomMeter {
    id: string;
    roomNo: string;
    floor: number;
    status: "active" | "inactive";
    oldReading: number;
    newReading: number | null;
    usage: number;
    cost: number;
}

/** อัตราค่าน้ำ/ไฟ จาก condo_utility_configs */
interface UtilityRates {
    water: number;
    electric: number;
}

/* ================================================================
   Backend calls  (ตรงกับ backend index.js)
   ================================================================ */

/**
 * GET /api/v1/condos/:id/utilities
 * → { ok, configs: [{ utility_type: "water"|"electricity", billing_type, rate }] }
 * ดึงอัตราค่าน้ำ/ไฟที่เจ้าของหอตั้งค่าไว้
 */
async function fetchUtilityRates(condoId: string): Promise<UtilityRates> {
    const defaults: UtilityRates = { water: 18, electric: 8 };
    try {
        const res = await fetch(`${API}/api/v1/condos/${condoId}/utilities`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (!res.ok) return defaults;
        const data = await res.json();
        const configs: any[] = data.configs || [];
        for (const c of configs) {
            if (c.utility_type === "water") defaults.water = Number(c.rate || 18);
            if (c.utility_type === "electricity") defaults.electric = Number(c.rate || 8);
        }
    } catch { }
    return defaults;
}

/**
 * 1) GET /api/v1/condos/:id/rooms
 *    → { ok, rooms: [{ id, floor, roomNo, price, status, serviceId }] }
 *
 * 2) GET /api/v1/condos/:id/meters?type=water|electricity
 *    → { ok, meters: [{ id, roomId, roomNo, floor, type, previousReading, currentReading, unitsUsed, recordedAt }] }
 */
async function fetchRoomsAsMeters(condoId: string, type: MeterType): Promise<RoomMeter[]> {
    // 1) Fetch rooms
    const roomsRes = await fetch(`${API}/api/v1/condos/${condoId}/rooms`, {
        method: "GET",
        headers: authHeaders(),
    });
    if (!roomsRes.ok) throw new Error("โหลดรายการห้องไม่สำเร็จ");
    const roomsData = await roomsRes.json();
    const rawRooms: any[] = roomsData.rooms || [];

    // 2) Fetch latest meter readings
    const meterType = type === "electric" ? "electricity" : "water";
    let meterMap: Record<string, number> = {};
    try {
        const mRes = await fetch(`${API}/api/v1/condos/${condoId}/meters?type=${meterType}`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (mRes.ok) {
            const mData = await mRes.json();
            const meters: any[] = mData.meters || [];
            for (const m of meters) {
                const roomId = String(m.roomId || "");
                const reading = Number(m.currentReading ?? 0);
                if (!meterMap[roomId] || reading > meterMap[roomId]) {
                    meterMap[roomId] = reading;
                }
            }
        }
    } catch { }

    return rawRooms.map((r: any) => {
        const id = String(r.id);
        const roomNo = String(r.roomNo || "—");
        const floor = Number(r.floor ?? 1);
        const status = r.status === "OCCUPIED" ? "active" as const : "inactive" as const;
        const oldReading = meterMap[id] || 0;

        return {
            id,
            roomNo,
            floor,
            status,
            oldReading,
            newReading: null,
            usage: 0,
            cost: 0,
        };
    });
}

/**
 * POST /api/v1/condos/:id/meters
 * body: { roomId, type: "water"|"electricity", previousReading, currentReading }
 */
async function saveMeterReadings(condoId: string, type: MeterType, rooms: RoomMeter[]): Promise<void> {
    const meterType = type === "electric" ? "electricity" : "water";
    const toSave = rooms.filter((r) => r.newReading !== null && r.newReading >= r.oldReading);

    if (toSave.length === 0) throw new Error("ไม่มีข้อมูลที่ต้องบันทึก");

    const results = await Promise.allSettled(
        toSave.map((r) =>
            fetch(`${API}/api/v1/condos/${condoId}/meters`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    roomId: r.id,
                    type: meterType,
                    previousReading: r.oldReading,
                    currentReading: r.newReading,
                }),
            }).then(async (res) => {
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d?.error || `บันทึกห้อง ${r.roomNo} ไม่สำเร็จ`);
                }
            })
        )
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
        throw new Error(`บันทึกไม่สำเร็จ ${failures.length} รายการ`);
    }
}

/* ================================================================
   MeterPage_2  –  Record View (จดมิเตอร์)
   ================================================================ */
export default function MeterPage2() {
    const navigate = useNavigate();
    const [meterType, setMeterType] = useState<MeterType>("water");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const PER_PAGE = 4;

    // ✅ อัตราค่าน้ำ/ไฟจาก backend (ไม่ hardcode)
    const [rates, setRates] = useState<UtilityRates>({ water: 0, electric: 0 });
    const rate = meterType === "water" ? rates.water : rates.electric;

    const [waterData, setWaterData] = useState<RoomMeter[]>([]);
    const [electricData, setElectricData] = useState<RoomMeter[]>([]);

    const [condoId, setCondoId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const data = meterType === "water" ? waterData : electricData;
    const setData = meterType === "water" ? setWaterData : setElectricData;

    /* ===== Load rooms + utility rates from backend ===== */
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                setError(null);

                const cId = await resolveCondoId();
                setCondoId(cId);

                // ✅ ดึงอัตราค่าน้ำ/ไฟจาก condo_utility_configs
                const utilRates = await fetchUtilityRates(cId);

                const [water, electric] = await Promise.all([
                    fetchRoomsAsMeters(cId, "water"),
                    fetchRoomsAsMeters(cId, "electric"),
                ]);

                if (cancelled) return;
                setRates(utilRates);
                setWaterData(water);
                setElectricData(electric);
                setLoading(false);
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
                setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, []);

    /* ===== Derived ===== */
    const filtered = useMemo(() => {
        if (!search.trim()) return data;
        return data.filter((r) => r.roomNo.includes(search.trim()));
    }, [data, search]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const pageData = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const handleNewReading = (id: string, val: string) => {
        const num = val === "" ? null : Number(val);
        setData((prev) =>
            prev.map((r) => {
                if (r.id !== id) return r;
                const newReading = num;
                const usage = newReading !== null && newReading >= r.oldReading ? newReading - r.oldReading : 0;
                return { ...r, newReading, usage, cost: usage * rate };
            })
        );
    };

    // ✅ เมื่อเปลี่ยน tab (water↔electric) ต้อง recalculate cost ของข้อมูลที่กรอกไปแล้ว
    useEffect(() => {
        setData((prev) =>
            prev.map((r) => {
                if (r.newReading === null) return r;
                const usage = r.newReading >= r.oldReading ? r.newReading - r.oldReading : 0;
                return { ...r, usage, cost: usage * rate };
            })
        );
    }, [meterType, rate]);

    /* ===== Save handler ===== */
    const handleSave = async () => {
        if (!condoId) return;
        const toSave = data.filter((r) => r.newReading !== null);
        if (toSave.length === 0) {
            alert("กรุณากรอกเลขมิเตอร์อย่างน้อย 1 ห้อง");
            return;
        }

        setSaving(true);
        try {
            await saveMeterReadings(condoId, meterType, data);
            alert("บันทึกข้อมูลสำเร็จ!");
            const refreshed = await fetchRoomsAsMeters(condoId, meterType);
            if (meterType === "water") setWaterData(refreshed);
            else setElectricData(refreshed);
        } catch (e: any) {
            alert(e?.message ?? "บันทึกไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    };

    /* ===== Clear handler ===== */
    const handleClear = () => {
        setData((prev) =>
            prev.map((r) => ({
                ...r,
                newReading: null,
                usage: 0,
                cost: 0,
            }))
        );
    };

    const totalRecords = filtered.length;

    // ✅ สรุปยอดรวมด้านล่างตาราง
    const totalUsage = data.reduce((s, r) => s + r.usage, 0);
    const totalCost = data.reduce((s, r) => s + r.cost, 0);

    return (
        <OwnerShell activeKey="meter">
            <div className="w-full mx-auto animate-in fade-in duration-300 pt-6 px-8 pb-10">
                {/* Page title + back button */}
                <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => navigate("/owner/meter")}
                            aria-label="ย้อนกลับ"
                            className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-[0.98] transition shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-extrabold text-gray-900">จดมิเตอร์</h1>
                            <p className="text-sm font-bold text-gray-400 mt-0.5">บันทึกค่าน้ำ-ค่าไฟประจำเดือน</p>
                        </div>
                    </div>

                    {/* ✅ แสดงอัตราค่าน้ำ/ไฟที่ดึงมาจาก backend */}
                    {!loading && !error && rate > 0 && (
                        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2">
                            <span className="text-xs font-bold text-gray-500">อัตรา{meterType === "water" ? "ค่าน้ำ" : "ค่าไฟ"}:</span>
                            <span className="text-sm font-extrabold text-[#93C5FD]">{rate} ฿/หน่วย</span>
                        </div>
                    )}
                </div>

                {/* Loading / Error states */}
                {loading && (
                    <div className="rounded-2xl bg-white border border-blue-100 shadow-sm px-6 py-12 text-center">
                        <div className="text-sm font-extrabold text-gray-600">กำลังโหลดข้อมูลห้อง...</div>
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded-2xl bg-rose-50 border border-rose-200 shadow-sm px-6 py-6">
                        <div className="font-extrabold text-rose-700">โหลดข้อมูลไม่สำเร็จ</div>
                        <div className="mt-1 text-sm font-bold text-rose-600">{error}</div>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-4 h-[40px] px-5 rounded-xl bg-white border border-rose-200 text-rose-700 font-extrabold text-sm hover:bg-rose-100/40"
                        >
                            ลองใหม่
                        </button>
                    </div>
                )}

                {/* Main content */}
                {!loading && !error && (
                    <div className="rounded-3xl bg-white border border-blue-100 shadow-[0_4px_24px_rgba(147,197,253,0.15)] overflow-hidden">
                        {/* Tabs + Search row */}
                        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4 flex-wrap">
                            <div className="flex items-center gap-3">
                                {/* Water tab */}
                                <button
                                    type="button"
                                    onClick={() => { setMeterType("water"); setPage(1); }}
                                    className={[
                                        "h-[42px] px-5 rounded-full font-extrabold text-sm transition flex items-center gap-2",
                                        meterType === "water"
                                            ? "bg-white border-2 border-[#93C5FD] text-[#93C5FD] shadow-sm"
                                            : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50",
                                    ].join(" ")}
                                >
                                    <img src={waterIcon} alt="น้ำ" className="w-5 h-5 object-contain" />
                                    ค่าน้ำ ({rates.water} ฿/หน่วย)
                                </button>
                                {/* Electric tab */}
                                <button
                                    type="button"
                                    onClick={() => { setMeterType("electric"); setPage(1); }}
                                    className={[
                                        "h-[42px] px-5 rounded-full font-extrabold text-sm transition flex items-center gap-2",
                                        meterType === "electric"
                                            ? "bg-white border-2 border-[#93C5FD] text-[#93C5FD] shadow-sm"
                                            : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50",
                                    ].join(" ")}
                                >
                                    <img src={electricIcon} alt="ไฟฟ้า" className="w-5 h-5 object-contain" />
                                    ค่าไฟ ({rates.electric} ฿/หน่วย)
                                </button>
                            </div>

                            {/* Search + filter */}
                            <div className="flex items-center gap-2">
                                <div className="relative w-56">
                                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="ค้นหาห้อง..."
                                        value={search}
                                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                                    />
                                </div>
                                <button aria-label="ตัวกรอง" className="h-[42px] w-[42px] rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-50 transition">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-t border-b border-gray-100">
                                    <th className="py-4 px-6 text-left font-extrabold text-gray-500 text-xs uppercase tracking-wider">ห้อง</th>
                                    <th className="py-4 px-4 text-left font-extrabold text-gray-500 text-xs uppercase tracking-wider">สถานะห้อง</th>
                                    <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">ยอดครั้งก่อน</th>
                                    <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">ยอดปัจจุบัน</th>
                                    <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">หน่วยที่ใช้</th>
                                    <th className="py-4 px-4 text-center font-extrabold text-gray-500 text-xs uppercase tracking-wider">ค่าใช้จ่าย</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageData.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition">
                                        <td className="py-5 px-6 font-extrabold text-gray-900 text-base">{r.roomNo}</td>
                                        <td className="py-5 px-4">
                                            <span className={[
                                                "inline-flex items-center px-4 py-1.5 rounded-full text-xs font-extrabold border",
                                                r.status === "active"
                                                    ? "bg-red-50 border-red-200 text-red-500"
                                                    : "bg-green-50 border-green-200 text-green-500",
                                            ].join(" ")}>
                                                {r.status === "active" ? "ไม่ว่าง" : "ว่าง"}
                                            </span>
                                        </td>
                                        <td className="py-5 px-4 text-center font-bold text-gray-700">
                                            {r.oldReading.toLocaleString()}
                                        </td>
                                        <td className="py-5 px-4 text-center">
                                            <input
                                                type="number"
                                                value={r.newReading ?? ""}
                                                onChange={(e) => handleNewReading(r.id, e.target.value)}
                                                placeholder="0"
                                                className="w-24 text-center rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 focus:bg-white"
                                            />
                                        </td>
                                        <td className="py-5 px-4 text-center font-bold text-[#93C5FD]">
                                            {r.usage > 0 ? r.usage.toLocaleString() : "0"}
                                        </td>
                                        <td className="py-5 px-4 text-center font-bold text-gray-700">
                                            {r.cost > 0 ? `${r.cost.toLocaleString()} ฿` : "-"}
                                        </td>
                                    </tr>
                                ))}

                                {pageData.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-16 text-center text-gray-400 font-bold">
                                            ไม่พบข้อมูลห้อง
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* ✅ Summary row */}
                        {totalUsage > 0 && (
                            <div className="flex items-center justify-end gap-8 px-6 py-4 bg-blue-50/40 border-t border-blue-100/50">
                                <div className="text-sm font-bold text-gray-500">
                                    รวมหน่วยที่ใช้: <span className="font-extrabold text-[#93C5FD]">{totalUsage.toLocaleString()} หน่วย</span>
                                </div>
                                <div className="text-sm font-bold text-gray-500">
                                    รวมค่าใช้จ่าย: <span className="font-extrabold text-gray-900">{totalCost.toLocaleString()} ฿</span>
                                </div>
                            </div>
                        )}

                        {/* Footer: info + buttons */}
                        <div className="flex items-center justify-between px-6 py-5 border-t border-gray-100 flex-wrap gap-3">
                            <div className="text-sm font-bold text-gray-400">
                                แสดงทั้งหมด {pageData.length} รายการ จาก {totalRecords} รายการ
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    className="h-[44px] px-6 rounded-xl bg-white border border-gray-200 text-gray-600 font-extrabold text-sm hover:bg-gray-50 active:scale-[0.98] transition flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    ล้างข้อมูล
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="h-[44px] px-6 rounded-xl bg-[#93C5FD] text-white font-extrabold text-sm shadow-[0_8px_20px_rgba(147,197,253,0.4)] hover:bg-[#7fb4fb] active:scale-[0.98] transition flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                    {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                                </button>
                            </div>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 py-5 bg-gradient-to-r from-blue-50/50 via-purple-50/30 to-blue-50/50 border-t border-blue-100/50">
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    aria-label="หน้าก่อนหน้า"
                                    className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 disabled:opacity-40 transition"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPage(p)}
                                        className={[
                                            "w-9 h-9 rounded-lg font-extrabold text-sm transition",
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
                                    className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 disabled:opacity-40 transition"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </OwnerShell>
    );
}
