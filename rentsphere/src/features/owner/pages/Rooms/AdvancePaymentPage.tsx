import OwnerShell from "@/features/owner/components/OwnerShell";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

/* ===== helpers ===== */
function moneyTHB(n?: number | null) {
    if (n == null || Number.isNaN(n)) return "0.00";
    return new Intl.NumberFormat("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

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

/** หา condoId — ลำดับ: 1) navigation state  2) localStorage  3) wizard store  4) API */
async function resolveCondoId(stateCondoId?: string | null): Promise<string> {
    if (stateCondoId) return stateCondoId;
    const lsCondoId = localStorage.getItem("rentsphere_selected_condo");
    if (lsCondoId) return lsCondoId;
    try {
        const raw = localStorage.getItem("rentsphere_condo_wizard");
        if (raw) { const id = JSON.parse(raw)?.state?.condoId; if (id) return id; }
    } catch { }
    try {
        const res = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() });
        if (res.ok) { const d = await res.json(); const c = d.condo || (d.condos && d.condos[0]); if (c?.id) return String(c.id); }
    } catch { }
    throw new Error("ไม่พบ condoId");
}

/* ===== stepper (3 steps shown here + step 4 gen-code is separate) ===== */
function Stepper({ step }: { step: 1 | 2 | 3 }) {
    const items = [
        { n: 1, label: "สัญญา" },
        { n: 2, label: "ค่าเช่าล่วงหน้า" },
        { n: 3, label: "มิเตอร์น้ำ-ไฟ" },
    ] as const;

    return (
        <div className="w-full flex items-center justify-center gap-8 py-2">
            {items.map((it, idx) => {
                const active = it.n === step;
                const done = it.n < step;
                return (
                    <div key={it.n} className="flex items-center gap-3">
                        <div
                            className={[
                                "w-9 h-9 rounded-full flex items-center justify-center font-extrabold",
                                active
                                    ? "bg-blue-600 text-white shadow-[0_12px_22px_rgba(37,99,235,0.25)]"
                                    : done
                                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                                        : "bg-white text-gray-500 border border-gray-200",
                            ].join(" ")}
                        >
                            {it.n}
                        </div>
                        <div className={active ? "font-extrabold text-blue-700" : "font-bold text-gray-600"}>
                            {it.label}
                        </div>
                        {idx !== items.length - 1 ? <div className="w-20 h-[3px] rounded-full bg-blue-100" /> : null}
                    </div>
                );
            })}
        </div>
    );
}

/* ===== Types ===== */
type RoomDetail = {
    id: string;
    roomNo: string;
    price: number | null;
    condoName?: string | null;
};

/* ===== Backend calls ===== */
async function fetchRoomDetail(roomId: string, condoId: string): Promise<RoomDetail> {
    const res = await fetch(`${API}/api/v1/condos/${condoId}/rooms`, {
        method: "GET",
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error("โหลดข้อมูลห้องไม่สำเร็จ");
    const data = await res.json();
    const rooms: any[] = data.rooms || [];
    const r = rooms.find((rm: any) => rm.id === roomId);
    if (!r) throw new Error("ไม่พบห้องนี้ในระบบ");

    let condoName = "คอนโดมิเนียม";
    try {
        const cRes = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() });
        if (cRes.ok) {
            const cData = await cRes.json();
            const list: any[] = cData.condos || [];
            if (cData.condo) list.push(cData.condo);
            const c = list.find((x: any) => String(x.id) === condoId) || list[0];
            if (c) condoName = c.name_th || c.nameTh || c.name || condoName;
        }
    } catch { }

    return {
        id: String(r.id),
        roomNo: String(r.room_no || r.roomNo || "-"),
        price: r.price != null ? Number(r.price) : null,
        condoName,
    };
}

async function saveAdvancePayment(condoId: string, roomId: string, payload: {
    totalAmount: number;
    dueDate: string;
    note: string;
}): Promise<void> {
    const res = await fetch(`${API}/api/v1/condos/${condoId}/invoices`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            roomId,
            totalAmount: payload.totalAmount,
            dueDate: payload.dueDate || null,
            note: payload.note || "ค่าเช่าล่วงหน้า",
        }),
    });
    if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "บันทึกค่าเช่าล่วงหน้าไม่สำเร็จ");
    }
}

export default function AdvancePaymentPage() {
    const nav = useNavigate();
    const { roomId } = useParams();
    const location = useLocation();
    const stateCondoId = (location.state as any)?.condoId as string | undefined;
    const stateTenantName = (location.state as any)?.tenantName as string | undefined;
    const stateRoomNo = (location.state as any)?.roomNo as string | undefined;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [room, setRoom] = useState<RoomDetail | null>(null);
    const [resolvedCondoId, setResolvedCondoId] = useState<string>("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!roomId) {
                setLoading(false);
                setRoom(null);
                setError("ไม่พบ roomId");
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const condoId = await resolveCondoId(stateCondoId);
                setResolvedCondoId(condoId);

                const data = await fetchRoomDetail(roomId, condoId);
                if (cancelled) return;

                setRoom(data);
                setLoading(false);
            } catch (e: any) {
                if (cancelled) return;
                setRoom(null);
                setError(e?.message ?? "เกิดข้อผิดพลาด");
                setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [roomId]);

    const condoName = room?.condoName ?? "คอนโดมิเนียม";
    const roomNo = stateRoomNo ?? room?.roomNo ?? "-";
    const rent = room?.price ?? 0;

    // ===== form state =====
    const [roundDate, setRoundDate] = useState("");
    const [detail, setDetail] = useState("");
    const [payBy, setPayBy] = useState("เงินสด");
    const [note, setNote] = useState("");
    const [advanceMonths, setAdvanceMonths] = useState<number>(1);

    const safeMonths = useMemo(() => {
        const m = Number(advanceMonths);
        if (!Number.isFinite(m)) return 0;
        return Math.max(0, Math.floor(m));
    }, [advanceMonths]);

    const advanceAmount = useMemo(() => (rent || 0) * safeMonths, [rent, safeMonths]);

    useEffect(() => {
        if (detail.trim()) return;
        if (!safeMonths) return;
        setDetail(`ค่าเช่าล่วงหน้า ${safeMonths} เดือน`);
    }, [safeMonths]);

    const goBack = () => {
        if (!roomId) { nav("/owner/rooms", { replace: true }); return; }
        nav(-1);
    };

    const goNext = async () => {
        if (!roomId) { nav("/owner/rooms", { replace: true }); return; }

        // บันทึกค่าเช่าล่วงหน้าเป็น invoice (ถ้ามียอด > 0)
        if (advanceAmount > 0 && resolvedCondoId) {
            setSaving(true);
            try {
                await saveAdvancePayment(resolvedCondoId, roomId, {
                    totalAmount: advanceAmount,
                    dueDate: roundDate || new Date().toISOString().slice(0, 10),
                    note: `${detail || "ค่าเช่าล่วงหน้า"} | ชำระโดย: ${payBy}${note ? " | " + note : ""}`,
                });
            } catch (e) {
                console.error("save advance payment error:", e);
            }
            setSaving(false);
        }

        nav(`/owner/rooms/${roomId}/meter`, {
            state: { tenantName: stateTenantName, roomNo, condoId: resolvedCondoId },
        });
    };

    if (loading) {
        return (
            <OwnerShell activeKey="rooms" showSidebar>
                <div className="rounded-2xl border border-blue-100/70 bg-white p-8">
                    <div className="text-sm font-extrabold text-gray-600">กำลังโหลดข้อมูล...</div>
                </div>
            </OwnerShell>
        );
    }

    if (!room || error) {
        return (
            <OwnerShell activeKey="rooms" showSidebar>
                <div className="rounded-2xl border border-blue-100/70 bg-white p-8">
                    <div className="text-xl font-extrabold text-gray-900 mb-2">ไม่พบข้อมูลห้อง</div>
                    <div className="text-gray-600 font-bold mb-2">roomId: {roomId}</div>
                    {error && <div className="text-rose-600 font-extrabold mb-6">{error}</div>}

                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => nav("/owner/rooms", { replace: true })}
                            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-extrabold hover:bg-blue-700">
                            กลับไปหน้าห้อง
                        </button>
                        <button type="button" onClick={() => window.location.reload()}
                            className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold hover:bg-gray-50">
                            ลองใหม่
                        </button>
                    </div>
                </div>
            </OwnerShell>
        );
    }

    return (
        <OwnerShell activeKey="rooms" showSidebar>
            {/* top header */}
            <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-bold text-gray-600">
                    คอนโดมิเนียม : <span className="text-gray-900">{condoName}</span>
                </div>
                <div className="text-sm font-extrabold text-gray-700">ห้อง {roomNo}</div>
            </div>

            <div className="rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                <div className="bg-[#EAF2FF] border-b border-blue-100/70 px-6 py-4">
                    <Stepper step={2} />
                </div>

                <div className="p-6">
                    <div className="mb-4">
                        <div className="text-xl font-extrabold text-gray-900">รับเงินค่าเช่าล่วงหน้า ตอนทำสัญญา</div>
                        <div className="text-sm font-bold text-gray-500 mt-1">คำนวณจากจำนวนเดือนล่วงหน้า × ค่าเช่าต่อเดือน ({moneyTHB(rent)} บาท)</div>
                    </div>
                    <div className="h-px bg-gray-200 mb-6" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div>
                            <div className="text-sm font-extrabold text-gray-800 mb-2">
                                รอบบิล / วันที่ <span className="text-rose-600">*</span>
                            </div>
                            <input type="date" value={roundDate} onChange={(e) => setRoundDate(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-200/60" />
                        </div>

                        <div>
                            <div className="text-sm font-extrabold text-gray-800 mb-2">
                                ชำระเงินโดย <span className="text-rose-600">*</span>
                            </div>
                            <select value={payBy} onChange={(e) => setPayBy(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-200/60">
                                <option value="เงินสด">เงินสด</option>
                                <option value="โอน">โอน</option>
                                <option value="บัตร">บัตร</option>
                            </select>
                        </div>

                        <div className="lg:col-span-2">
                            <div className="text-sm font-extrabold text-gray-800 mb-2">รายละเอียด</div>
                            <input value={detail} onChange={(e) => setDetail(e.target.value)}
                                placeholder="เช่น ค่าเช่าล่วงหน้า 1 เดือน"
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-200/60" />
                        </div>

                        <div>
                            <div className="text-sm font-extrabold text-gray-800 mb-2">
                                จำนวนเดือนล่วงหน้า <span className="text-rose-600">*</span>
                            </div>
                            <div className="flex items-stretch">
                                <input value={advanceMonths || ""} onChange={(e) => {
                                    const v = e.target.value.replace(/[^0-9]/g, "");
                                    setAdvanceMonths(v === "" ? 0 : parseInt(v) || 0);
                                }} inputMode="numeric"
                                    className="w-full rounded-l-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-200/60" />
                                <div className="rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 px-4 py-3 font-extrabold text-gray-700">เดือน</div>
                            </div>
                        </div>

                        <div>
                            <div className="text-sm font-extrabold text-gray-800 mb-2">
                                จำนวนเงินค่าเช่าล่วงหน้า
                            </div>
                            <div className="flex items-stretch">
                                <input value={moneyTHB(advanceAmount)} readOnly
                                    className="w-full rounded-l-xl border border-gray-200 bg-white px-4 py-3 font-extrabold text-gray-900 focus:outline-none" />
                                <div className="rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 px-4 py-3 font-extrabold text-gray-700">บาท</div>
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            <div className="text-sm font-bold text-gray-700 mb-2">Note</div>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-200/60" />
                        </div>
                    </div>

                    {/* footer */}
                    <div className="mt-8 flex items-center justify-end gap-3">
                        <button type="button" onClick={goBack}
                            className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold hover:bg-gray-50">
                            ย้อนกลับ
                        </button>
                        <button type="button" onClick={goNext} disabled={saving}
                            className="px-7 py-3 rounded-xl !bg-blue-600 text-white font-extrabold shadow-[0_12px_22px_rgba(37,99,235,0.22)] hover:!bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">
                            {saving ? "กำลังบันทึก..." : "ต่อไป"}
                        </button>
                    </div>
                </div>
            </div>
        </OwnerShell>
    );
}