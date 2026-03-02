import OwnerShell from "@/features/owner/components/OwnerShell";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

/* ===== helpers ===== */
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

async function resolveCondoId(stateCondoId?: string | null): Promise<string> {
    if (stateCondoId) return stateCondoId;
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

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/* ===== stepper ===== */
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

                        {idx !== items.length - 1 && <div className="w-20 h-[3px] rounded-full bg-blue-100" />}
                    </div>
                );
            })}
        </div>
    );
}

/* ===== types ===== */
type RoomDetail = {
    id: string;
    roomNo: string;
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
            const c = cData.condo || (cData.condos && cData.condos[0]);
            if (c) condoName = c.name_th || c.nameTh || c.name || condoName;
        }
    } catch { }

    return {
        id: String(r.id),
        roomNo: String(r.room_no || r.roomNo || "-"),
        condoName,
    };
}

async function saveRoomMeters(condoId: string, roomId: string, payload: {
    waterMeter: string;
    elecMeter: string;
}): Promise<void> {
    // Backend expects separate requests per type: "water" and "electricity"
    const saveOne = async (type: string, value: string) => {
        const res = await fetch(`${API}/api/v1/condos/${condoId}/meters`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
                roomId,
                type,
                previousReading: 0,
                currentReading: Number(value || 0),
            }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d?.error || `บันทึกมิเตอร์ ${type} ไม่สำเร็จ`);
        }
    };

    await Promise.all([
        saveOne("water", payload.waterMeter),
        saveOne("electricity", payload.elecMeter),
    ]);
}

export default function RoomMeterPage() {
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

    /* ===== form state ===== */
    const [waterMeter, setWaterMeter] = useState("");
    const [elecMeter, setElecMeter] = useState("");
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

                const detail = await fetchRoomDetail(roomId, condoId);
                if (cancelled) return;

                setRoom(detail);
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

    const condoName = useMemo(() => room?.condoName ?? "คอนโดมิเนียม", [room]);
    const roomNo = useMemo(() => stateRoomNo ?? room?.roomNo ?? "-", [room, stateRoomNo]);

    const goBack = () => {
        if (!roomId) { nav("/owner/rooms", { replace: true }); return; }
        nav(-1);
    };

    const onSave = async () => {
        if (!roomId) return;

        if (!waterMeter || !elecMeter) {
            alert("กรุณากรอกเลขมิเตอร์ให้ครบ");
            return;
        }

        setSaving(true);
        try {
            if (resolvedCondoId) {
                await saveRoomMeters(resolvedCondoId, roomId, { waterMeter, elecMeter });
            }
            // ไปหน้า gen access code (Step สุดท้าย)
            nav(`/owner/rooms/${roomId}/access-code`, {
                state: { tenantName: stateTenantName, roomNo, condoId: resolvedCondoId },
            });
        } catch (e: any) {
            alert(e?.message ?? "บันทึกไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
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

    if (!roomId || error || !room) {
        return (
            <OwnerShell activeKey="rooms" showSidebar>
                <div className="rounded-2xl border border-blue-100/70 bg-white p-8">
                    <div className="text-xl font-extrabold text-gray-900 mb-2">ไม่พบข้อมูลห้อง</div>
                    <div className="text-gray-600 font-bold mb-2">roomId: {roomId}</div>
                    {error && <div className="text-rose-600 font-extrabold mb-6">{error}</div>}

                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => nav("/owner/rooms", { replace: true })}
                            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-extrabold">
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
            {/* header */}
            <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-bold text-gray-600">
                    คอนโดมิเนียม : <span className="text-gray-900">{condoName}</span>
                </div>
                <div className="text-sm font-extrabold text-gray-700">ห้อง {roomNo}</div>
            </div>

            <div className="rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                <div className="bg-[#EAF2FF] border-b border-blue-100/70 px-6 py-4">
                    <Stepper step={3} />
                </div>

                <div className="p-6">
                    <div className="mb-4">
                        <div className="text-xl font-extrabold text-gray-900">เลขมิเตอร์วันเข้าพัก</div>
                        <div className="text-sm font-bold text-gray-500 mt-1">กรอกเลขมิเตอร์เริ่มต้น ณ วันที่ทำสัญญา / เข้าอยู่</div>
                    </div>

                    <div className="h-px bg-gray-200 mb-6" />

                    <div className="rounded-2xl border border-blue-100/70 bg-[#F3F7FF] p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <div>
                                <div className="text-sm font-extrabold text-gray-800 mb-2">
                                    เลขมิเตอร์ค่าน้ำ <span className="text-rose-600">*</span>
                                </div>
                                <input
                                    value={waterMeter}
                                    onChange={(e) => setWaterMeter(onlyDigits(e.target.value))}
                                    inputMode="numeric"
                                    placeholder="เช่น 1234"
                                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-extrabold text-gray-900
                  focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                />
                            </div>

                            <div>
                                <div className="text-sm font-extrabold text-gray-800 mb-2">
                                    เลขมิเตอร์ค่าไฟ <span className="text-rose-600">*</span>
                                </div>
                                <input
                                    value={elecMeter}
                                    onChange={(e) => setElecMeter(onlyDigits(e.target.value))}
                                    inputMode="numeric"
                                    placeholder="เช่น 5678"
                                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-extrabold text-gray-900
                  focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex items-center justify-end gap-4">
                        <button type="button" onClick={goBack}
                            className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold">
                            ย้อนกลับ
                        </button>

                        <button type="button" onClick={onSave} disabled={saving}
                            className="px-7 py-3 rounded-xl !bg-blue-600 text-white font-extrabold shadow-lg hover:!bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">
                            {saving ? "กำลังบันทึก..." : "บันทึกและต่อไป"}
                        </button>
                    </div>
                </div>
            </div>
        </OwnerShell>
    );
}