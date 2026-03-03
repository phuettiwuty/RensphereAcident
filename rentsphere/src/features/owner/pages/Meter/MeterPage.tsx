import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OwnerShell from "@/features/owner/components/OwnerShell";

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
   Types  (ตรงกับ backend response)
   ================================================================ */

/** ตรงกับ GET /api/v1/condos/:id/meters → meters[] */
type MeterRecord = {
    id: string;
    roomId: string;
    roomNo: string;
    floor: number;
    type: "water" | "electricity";
    previousReading: number;
    currentReading: number;
    unitsUsed: number;
    recordedAt: string;
};

/** อัตราค่าน้ำ/ไฟ จาก condo_utility_configs */
interface UtilityRates {
    water: number;
    electric: number;
}

/* ================================================================
   Backend calls
   ================================================================ */

/**
 * GET /api/v1/condos/:id/utilities
 * → { ok, configs: [{ utility_type: "water"|"electricity", billing_type, rate }] }
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
 * GET /api/v1/condos/:id/meters
 * backend returns: { ok, meters: [...] }
 */
async function fetchAllMeterReadings(condoId: string): Promise<MeterRecord[]> {
    const res = await fetch(`${API}/api/v1/condos/${condoId}/meters`, {
        method: "GET",
        headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const meters: any[] = data.meters || [];

    return meters.map((m: any) => ({
        id: String(m.id),
        roomId: String(m.roomId || ""),
        roomNo: String(m.roomNo || "—"),
        floor: Number(m.floor || 1),
        type: m.type === "electricity" ? "electricity" as const : "water" as const,
        previousReading: Number(m.previousReading ?? 0),
        currentReading: Number(m.currentReading ?? 0),
        unitsUsed: Number(m.unitsUsed ?? (Number(m.currentReading ?? 0) - Number(m.previousReading ?? 0))),
        recordedAt: String(m.recordedAt || ""),
    }));
}

/* ================================================================
   Calendar Widget
   ================================================================ */
const DAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function getCalendarDays(year: number, month: number) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const rows: (number | null)[][] = [];
    let week: (number | null)[] = new Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
        week.push(d);
        if (week.length === 7) {
            rows.push(week);
            week = [];
        }
    }
    if (week.length) {
        while (week.length < 7) week.push(null);
        rows.push(week);
    }
    return rows;
}

function MiniCalendar({
    selectedDate,
    onSelect,
    recordedDates,
}: {
    selectedDate: Date;
    onSelect: (d: Date) => void;
    recordedDates: Set<string>;
}) {
    const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
    const weeks = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);
    const today = new Date();

    const prev = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
        else setViewMonth((m) => m - 1);
    };
    const next = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
        else setViewMonth((m) => m + 1);
    };

    return (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 w-full max-w-[340px]">
            <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={prev} aria-label="เดือนก่อนหน้า" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="font-extrabold text-gray-900 text-base tracking-tight">
                    {MONTHS_TH[viewMonth]} {viewYear + 543}
                </div>
                <button type="button" onClick={next} aria-label="เดือนถัดไป" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 mb-2">
                {DAYS_TH.map((d) => <div key={d}>{d}</div>)}
            </div>

            {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 text-center">
                    {week.map((day, di) => {
                        if (!day) return <div key={di} />;
                        const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                        const isSelected = day === selectedDate.getDate() && viewMonth === selectedDate.getMonth() && viewYear === selectedDate.getFullYear();
                        const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const hasRecord = recordedDates.has(dateKey);
                        return (
                            <button
                                key={di}
                                type="button"
                                onClick={() => onSelect(new Date(viewYear, viewMonth, day))}
                                className={[
                                    "w-9 h-9 rounded-full text-sm font-bold transition mx-auto relative",
                                    isSelected
                                        ? "bg-[#93C5FD] text-white"
                                        : isToday
                                            ? "bg-blue-100 text-blue-700"
                                            : hasRecord
                                                ? "bg-blue-50 text-blue-600"
                                                : "text-gray-700 hover:bg-gray-100",
                                ].join(" ")}
                            >
                                {day}
                                {hasRecord && !isSelected && (
                                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#93C5FD]" />
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}

            <div className="mt-4 flex flex-col gap-2 text-xs text-gray-500 font-bold">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#93C5FD]" />
                    วันที่มีการบันทึก
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    วันที่ยังไม่มีการบันทึก
                </div>
            </div>
        </div>
    );
}

/* ================================================================
   History View
   ================================================================ */
function HistoryView({
    records,
    loading,
    rates,
}: {
    records: MeterRecord[];
    loading: boolean;
    rates: UtilityRates;
}) {
    const [selectedDate, setSelectedDate] = useState(new Date());

    const recordedDates = useMemo(() => {
        const dates = new Set<string>();
        for (const r of records) {
            if (r.recordedAt) {
                try {
                    const d = new Date(r.recordedAt);
                    const parts = d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).split("-");
                    dates.add(parts.join("-"));
                } catch { }
            }
        }
        return dates;
    }, [records]);

    const filteredRecords = useMemo(() => {
        const selKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
        return records.filter((r) => {
            if (!r.recordedAt) return false;
            try {
                const d = new Date(r.recordedAt);
                const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
                return key === selKey;
            } catch { return false; }
        });
    }, [records, selectedDate]);

    const latestWater = useMemo(() => {
        const water = records.filter((r) => r.type === "water").sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
        return water[0] || null;
    }, [records]);

    const latestElectric = useMemo(() => {
        const elec = records.filter((r) => r.type === "electricity").sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
        return elec[0] || null;
    }, [records]);

    /** ✅ คำนวณค่าใช้จ่ายจาก unitsUsed × rate จาก backend */
    function calcCost(r: MeterRecord): number {
        const rate = r.type === "water" ? rates.water : rates.electric;
        return r.unitsUsed * rate;
    }

    function fmtDate(d: string) {
        try {
            return new Date(d).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric" });
        } catch { return d; }
    }

    return (
        <div className="flex gap-8 items-start">
            <div className="flex-1 min-w-0">

                {loading ? (
                    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-12 text-center">
                        <div className="text-sm font-extrabold text-gray-600">กำลังโหลดประวัติ...</div>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 text-sm font-bold text-gray-500">
                            วันที่ {selectedDate.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric" })}
                        </div>
                        <div className="h-px bg-gray-100 mx-4" />
                        <div className="px-8 py-12 flex flex-col items-center text-center">
                            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                                <svg className="w-7 h-7 text-[#93C5FD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="text-lg font-extrabold text-gray-900 mb-1">ไม่มีข้อมูล</div>
                            <div className="text-sm font-bold text-gray-400">
                                ยังไม่มีการบันทึกรายการในวันนี้ กรุณากดปุ่มด้านบน<br />
                                เพื่อสร้างรายการใหม่
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 flex items-center justify-between">
                            <div className="text-sm font-bold text-gray-500">
                                วันที่ {selectedDate.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric" })}
                            </div>
                            <div className="text-xs font-bold text-gray-400">
                                {filteredRecords.length} รายการ
                            </div>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-t border-b border-gray-100">
                                    <th className="py-3 px-6 text-left font-extrabold text-gray-500 text-xs uppercase">ห้อง</th>
                                    <th className="py-3 px-4 text-left font-extrabold text-gray-500 text-xs uppercase">ประเภท</th>
                                    <th className="py-3 px-4 text-center font-extrabold text-gray-500 text-xs uppercase">ยอดก่อนหน้า</th>
                                    <th className="py-3 px-4 text-center font-extrabold text-gray-500 text-xs uppercase">ยอดปัจจุบัน</th>
                                    <th className="py-3 px-4 text-center font-extrabold text-gray-500 text-xs uppercase">หน่วยที่ใช้</th>
                                    <th className="py-3 px-4 text-center font-extrabold text-gray-500 text-xs uppercase">ค่าใช้จ่าย</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition">
                                        <td className="py-4 px-6 font-extrabold text-gray-900">{r.roomNo}</td>
                                        <td className="py-4 px-4">
                                            <span className={[
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border",
                                                r.type === "water"
                                                    ? "bg-sky-50 border-sky-200 text-sky-600"
                                                    : "bg-amber-50 border-amber-200 text-amber-600",
                                            ].join(" ")}>
                                                {r.type === "water" ? "💧 ค่าน้ำ" : "⚡ ค่าไฟ"}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-center font-bold text-gray-600">{r.previousReading.toLocaleString()}</td>
                                        <td className="py-4 px-4 text-center font-bold text-gray-700">{r.currentReading.toLocaleString()}</td>
                                        <td className="py-4 px-4 text-center font-bold text-[#93C5FD]">{r.unitsUsed.toLocaleString()}</td>
                                        <td className="py-4 px-4 text-center font-bold text-gray-700">{calcCost(r).toLocaleString()} ฿</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* ✅ สรุปยอดรวมของวันที่เลือก */}
                        <div className="flex items-center justify-end gap-8 px-6 py-3 bg-blue-50/40 border-t border-blue-100/50">
                            <div className="text-sm font-bold text-gray-500">
                                รวม: <span className="font-extrabold text-[#93C5FD]">{filteredRecords.reduce((s, r) => s + r.unitsUsed, 0).toLocaleString()} หน่วย</span>
                            </div>
                            <div className="text-sm font-bold text-gray-500">
                                รวมค่าใช้จ่าย: <span className="font-extrabold text-gray-900">{filteredRecords.reduce((s, r) => s + calcCost(r), 0).toLocaleString()} ฿</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status cards */}
                <div className="flex items-stretch gap-4 mt-5">
                    {/* ไฟฟ้า */}
                    <div className="flex-1 rounded-2xl bg-white border border-blue-100/60 px-5 py-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-[#93C5FD]/20 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-[#93C5FD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-xs font-bold text-gray-400">ไฟฟ้าล่าสุด ({rates.electric} ฿/หน่วย)</div>
                            <div className="text-sm font-extrabold text-gray-700">
                                {latestElectric
                                    ? `${latestElectric.unitsUsed.toLocaleString()} หน่วย = ${(latestElectric.unitsUsed * rates.electric).toLocaleString()} ฿`
                                    : "ยังไม่มีข้อมูล"
                                }
                            </div>
                            {latestElectric && (
                                <div className="text-xs font-bold text-gray-400 mt-0.5">{fmtDate(latestElectric.recordedAt)}</div>
                            )}
                        </div>
                    </div>
                    {/* ประปา */}
                    <div className="flex-1 rounded-2xl bg-white border border-green-100/60 px-5 py-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-green-400/20 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3c-4 4.5-7 8-7 11a7 7 0 1014 0c0-3-3-6.5-7-11z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-xs font-bold text-gray-400">ประปาล่าสุด ({rates.water} ฿/หน่วย)</div>
                            <div className="text-sm font-extrabold text-gray-700">
                                {latestWater
                                    ? `${latestWater.unitsUsed.toLocaleString()} หน่วย = ${(latestWater.unitsUsed * rates.water).toLocaleString()} ฿`
                                    : "ยังไม่มีข้อมูล"
                                }
                            </div>
                            {latestWater && (
                                <div className="text-xs font-bold text-gray-400 mt-0.5">{fmtDate(latestWater.recordedAt)}</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: calendar */}
            <div className="shrink-0">
                <MiniCalendar selectedDate={selectedDate} onSelect={setSelectedDate} recordedDates={recordedDates} />
            </div>
        </div>
    );
}


/* ================================================================
   Main Page
   ================================================================ */
export default function MeterPage() {
    const navigate = useNavigate();
    const [records, setRecords] = useState<MeterRecord[]>([]);
    const [rates, setRates] = useState<UtilityRates>({ water: 0, electric: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                const condoId = await resolveCondoId();

                // ✅ ดึงทั้ง meter readings + utility rates พร้อมกัน
                const [data, utilRates] = await Promise.all([
                    fetchAllMeterReadings(condoId),
                    fetchUtilityRates(condoId),
                ]);

                if (cancelled) return;
                setRecords(data);
                setRates(utilRates);
            } catch {
                if (cancelled) return;
                setRecords([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <OwnerShell activeKey="meter">
            <div className="w-full mx-auto animate-in fade-in duration-300 pt-6 px-8 pb-10">
                <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">ประวัติการจดมิเตอร์</h1>
                        <p className="text-sm font-bold text-gray-500 mt-1 pt-3">
                            จัดการและบันทึกข้อมูลมิเตอร์สาธารณูปโภคทั้งหมด
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => navigate("/owner/meter/record")}
                        className="h-[40px] px-5 rounded-lg bg-[#93C5FD] text-white font-extrabold text-sm shadow-[0_8px_20px_rgba(0,0,0,0.15)] hover:bg-[#7fb4fb] active:scale-[0.98] transition flex items-center gap-2"
                    >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
                            <span className="text-[16px] font-black leading-none text-[#93C5FD]">+</span>
                        </span>
                        จดมิเตอร์
                    </button>
                </div>

                <HistoryView records={records} loading={loading} rates={rates} />
            </div>
        </OwnerShell>
    );
}
