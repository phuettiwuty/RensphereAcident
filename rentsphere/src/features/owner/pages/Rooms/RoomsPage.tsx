import OwnerShell from "@/features/owner/components/OwnerShell";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";

/* ================= helpers ================= */
function getRoomLabel(room: any) {
    return room?.roomNo ?? "-";
}

function getRoomRent(room: any) {
    const v = room?.price;
    if (v === null || v === undefined) return "-";
    if (typeof v === "number") return `${v.toLocaleString()} บาท`;
    const n = Number(v);
    if (!Number.isNaN(n)) return `${n.toLocaleString()} บาท`;
    return String(v);
}

function StatusPill({ status }: { status: "VACANT" | "OCCUPIED" | string }) {
    const vacant = status === "VACANT";
    return (
        <span
            className={[
                "inline-flex items-center justify-center",
                "min-w-[56px] px-3 py-1 rounded-full text-xs font-extrabold border",
                vacant
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200",
            ].join(" ")}
        >
            {vacant ? "ว่าง" : "ไม่ว่าง"}
        </span>
    );
}

/* ================= types (โครงไว้ให้ backend มาเชื่อม) ================= */
type CondoLite = { id: string; name: string };

type RoomRow = {
    id: string;
    condoId: string;

    roomNo: string;
    floor?: number;

    isActive: boolean;
    status: "VACANT" | "OCCUPIED" | string;

    price?: number | null;

    tenantName?: string | null;
    moveOutAt?: string | null;
    advanceBooking?: number | null;
    unpaidBills?: number | null;
};

/* ================= backend calls (แก้ URL ให้ตรง) ================= */
const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function getAuthToken(): string {
    try {
        const raw = localStorage.getItem("rentsphere_auth");
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        return parsed?.state?.token || "";
    } catch {
        return "";
    }
}

function authHeaders() {
    const token = getAuthToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function fetchMyCondos(): Promise<CondoLite[]> {
    const res = await fetch(`${API}/api/v1/condos/mine`, {
        method: "GET",
        headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const list: any[] = [];
    if (data.condo) list.push(data.condo);
    if (Array.isArray(data.condos)) list.push(...data.condos);
    if (Array.isArray(data)) list.push(...data);

    return list.map((x: any) => ({
        id: String(x.id),
        name: String(x.name_th || x.nameTh || x.name || "—"),
    }));
}

async function fetchRooms(condoId: string): Promise<RoomRow[]> {
    const res = await fetch(`${API}/api/v1/condos/${condoId}/rooms`, {
        method: "GET",
        headers: authHeaders(),
    });

    if (!res.ok) throw new Error("โหลดรายการห้องไม่สำเร็จ");
    const data = await res.json();

    const rawRooms: any[] = data.rooms || (Array.isArray(data) ? data : []);

    return rawRooms.map((r: any) => ({
        id: String(r.id),
        condoId: String(r.condo_id || r.condoId || condoId),
        roomNo: String(r.room_no || r.roomNo || "—"),
        floor: r.floor ?? undefined,
        isActive: r.is_active ?? r.isActive ?? true,
        status: r.status || "VACANT",
        price: r.price != null ? Number(r.price) : null,
        tenantName: r.tenant_name ?? r.tenantName ?? null,
        moveOutAt: r.move_out_at ?? r.moveOutAt ?? null,
        advanceBooking: r.advance_booking ?? r.advanceBooking ?? null,
        unpaidBills: r.unpaid_bills ?? r.unpaidBills ?? null,
    }));
}

/* ================= Page ================= */
type LocationState = { condoId?: string } | null;

export default function RoomsPage() {
    const nav = useNavigate();
    const location = useLocation();

    const state = (location.state ?? null) as LocationState;
    const condoIdFromState = state?.condoId ?? null;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [condoId, setCondoId] = useState<string | null>(condoIdFromState);
    const [condoName, setCondoName] = useState<string>("—");
    const [condos, setCondos] = useState<CondoLite[]>([]);

    const [rooms, setRooms] = useState<RoomRow[]>([]);

    // modal เลือกห้อง
    const [openPickRoom, setOpenPickRoom] = useState(false);
    const [pickRoomId, setPickRoomId] = useState<string>("");

    //1) โหลดรายการคอนโดทั้งหมดของ owner
    useEffect(() => {
        let cancelled = false;

        const loadCondos = async () => {
            try {
                setLoading(true);
                setError(null);

                const list = await fetchMyCondos();
                if (cancelled) return;

                setCondos(list);

                if (list.length === 0) {
                    setLoading(false);
                    setRooms([]);
                    setCondoName("—");
                    return;
                }

                // ถ้ามี condoId จาก state ให้ใช้ตัวนั้น, ไม่งั้นเลือกตัวแรก
                const picked = condoIdFromState
                    ? list.find(c => c.id === condoIdFromState) || list[0]
                    : list[0];

                setCondoId(picked.id);
                setCondoName(picked.name);
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message ?? "เกิดข้อผิดพลาด");
                setLoading(false);
            }
        };

        loadCondos();
        return () => {
            cancelled = true;
        };
    }, []);

    //2)โหลด rooms จาก backend
    useEffect(() => {
        let cancelled = false;

        const loadRooms = async () => {
            if (!condoId) return;

            try {
                setLoading(true);
                setError(null);

                //ถ้ายังไม่รู้ชื่อคอนโด (เช่นส่ง condoId มาเฉย ๆ)ดึงจาก list
                if (condoName === "—") {
                    const condos = await fetchMyCondos();
                    const found = condos.find((c) => c.id === condoId);
                    if (!cancelled && found) setCondoName(found.name);
                }

                const data = await fetchRooms(condoId);
                if (cancelled) return;

                setRooms(Array.isArray(data) ? data : []);
                setLoading(false);
            } catch (e: any) {
                if (cancelled) return;
                setRooms([]);
                setError(e?.message ?? "เกิดข้อผิดพลาด");
                setLoading(false);
            }
        };

        loadRooms();
        return () => {
            cancelled = true;
        };
    }, [condoId, condoName]);

    /* ================= computed ================= */
    const roomsTotal = useMemo(() => rooms?.length ?? 0, [rooms]);

    const roomsVacant = useMemo(
        () => (rooms ?? []).filter((r: any) => r?.isActive && r?.status === "VACANT").length,
        [rooms]
    );

    const advanceBooking = useMemo(() => 0, []);
    const unpaidBills = useMemo(() => 0, []);

    const openModal = () => {
        const first = (rooms ?? [])[0];
        setPickRoomId(first?.id ? String(first.id) : "");
        setOpenPickRoom(true);
    };

    return (
        <OwnerShell title="ห้อง" activeKey="rooms" showSidebar={true}>
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <label className="text-sm font-bold text-gray-500 flex items-center gap-1.5">
                        <Building2 size={15} /> คอนโดมิเนียม :
                    </label>
                    {condos.length > 1 ? (
                        <select
                            value={condoId || ""}
                            onChange={(e) => {
                                const c = condos.find(x => x.id === e.target.value);
                                if (c) {
                                    setCondoId(c.id);
                                    setCondoName(c.name);
                                }
                            }}
                            className="rounded-xl border-2 border-blue-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-800 focus:border-indigo-400 focus:outline-none"
                        >
                            {condos.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    ) : (
                        <span className="text-sm font-bold text-gray-800">{condoName}</span>
                    )}
                </div>

                <button
                    type="button"
                    onClick={openModal}
                    className="text-sm font-extrabold text-gray-600 underline underline-offset-4 hover:text-gray-900"
                    disabled={roomsTotal === 0}
                >
                    สร้างรหัสเข้าสู่ระบบ
                </button>
            </div>

            {/* ===== states ===== */}
            {loading && (
                <div className="rounded-2xl bg-white border border-blue-100/70 shadow-sm px-6 py-8 text-center">
                    <div className="text-sm font-extrabold text-gray-600">กำลังโหลดรายการห้อง...</div>
                </div>
            )}

            {!loading && error && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 shadow-sm px-6 py-6">
                    <div className="font-extrabold text-rose-700">โหลดข้อมูลไม่สำเร็จ</div>
                    <div className="mt-1 text-sm font-bold text-rose-600">{error}</div>

                    <button
                        type="button"
                        onClick={() => {
                            setCondoId((x) => (x ? `${x}` : x));
                        }}
                        className="mt-4 h-[44px] px-6 rounded-xl bg-white border border-rose-200 text-rose-700 font-extrabold text-sm shadow-sm hover:bg-rose-100/40 active:scale-[0.98]"
                    >
                        ลองใหม่
                    </button>
                </div>
            )}

            {!loading && !error && !condoId && (
                <div className="rounded-2xl bg-white border border-blue-100/70 shadow-sm px-6 py-8 text-center">
                    <div className="text-lg font-extrabold text-gray-900">ยังไม่มีคอนโดในระบบ</div>
                    <div className="mt-2 text-sm font-bold text-gray-600">
                        กรุณาเพิ่มคอนโดก่อน แล้วค่อยกลับมาดูรายการห้อง
                    </div>

                    <button
                        type="button"
                        onClick={() => nav("/owner/add-condo/step-0")}
                        className="mt-5 h-[46px] px-10 rounded-xl border-0 text-white font-extrabold text-sm shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition
                       !bg-[#93C5FD] hover:!bg-[#7fb4fb] active:scale-[0.98]"
                    >
                        เพิ่มคอนโดมิเนียม
                    </button>
                </div>
            )}

            {/* ===== content  ===== */}
            {!loading && !error && condoId && (
                <>
                    {/* summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="rounded-2xl bg-white border border-blue-100/70 shadow-sm px-6 py-5 text-center">
                            <div className="text-4xl font-black text-indigo-700">{roomsTotal}</div>
                            <div className="mt-1 text-sm font-bold text-gray-600">ห้องพักทั้งหมด</div>
                        </div>

                        <div className="rounded-2xl bg-white border border-blue-100/70 shadow-sm px-6 py-5 text-center">
                            <div className="text-4xl font-black text-indigo-700">{roomsVacant}</div>
                            <div className="mt-1 text-sm font-bold text-gray-600">ห้องว่าง</div>
                        </div>

                        <div className="rounded-2xl bg-white border border-blue-100/70 shadow-sm px-6 py-5 text-center">
                            <div className="text-4xl font-black text-indigo-700">{advanceBooking}</div>
                            <div className="mt-1 text-sm font-bold text-gray-600">จองล่วงหน้า</div>
                        </div>

                        <div className="rounded-2xl bg-white border border-blue-100/70 shadow-sm px-6 py-5 text-center">
                            <div className="text-4xl font-black text-indigo-700">{unpaidBills}</div>
                            <div className="mt-1 text-sm font-bold text-gray-600">ค้างชำระ</div>
                        </div>
                    </div>

                    {/* table */}
                    <div className="mt-6 rounded-2xl border border-blue-100/70 bg-white overflow-hidden">
                        <div className="px-6 py-4 bg-[#f3f7ff] border-b border-blue-100/70 flex items-center justify-between">
                            <div className="text-lg font-extrabold text-gray-900">รายการห้อง</div>
                            <div className="text-sm font-bold text-gray-500">ทั้งหมด {roomsTotal} ห้อง</div>
                        </div>

                        <div className="w-full overflow-x-auto">
                            <table className="min-w-[980px] w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-700 border-b border-gray-100">
                                        <th className="px-6 py-4 font-extrabold">ห้อง</th>
                                        <th className="px-6 py-4 font-extrabold">สถานะ</th>
                                        <th className="px-6 py-4 font-extrabold">ลูกค้า</th>
                                        <th className="px-6 py-4 font-extrabold">ค่าเช่า</th>
                                        <th className="px-6 py-4 font-extrabold">แจ้งออก</th>
                                        <th className="px-6 py-4 font-extrabold">จองล่วงหน้า</th>
                                        <th className="px-6 py-4 font-extrabold">ค้างชำระ</th>
                                        <th className="px-6 py-4 font-extrabold text-right">รายละเอียด</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {roomsTotal === 0 ? (
                                        <tr>
                                            <td className="px-6 py-10 text-gray-500 font-bold" colSpan={8}>
                                                ยังไม่มีข้อมูลห้อง
                                            </td>
                                        </tr>
                                    ) : (
                                        rooms.map((r: any) => {
                                            const roomId = r?.id ?? r?.roomNo;

                                            const label = getRoomLabel(r);
                                            const rent = getRoomRent(r);
                                            const status = r?.status ?? "VACANT";

                                            const tenant = r?.tenantName ?? "-";
                                            const moveOut = r?.moveOutAt ?? "-";
                                            const booking = r?.advanceBooking ?? "-";
                                            const unpaid = r?.unpaidBills ?? "-";

                                            return (
                                                <tr key={String(roomId)} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                                                    <td className="px-6 py-4 font-extrabold text-gray-900">{label}</td>

                                                    <td className="px-6 py-4">
                                                        <StatusPill status={status} />
                                                    </td>

                                                    <td className="px-6 py-4 font-bold text-gray-600">{tenant}</td>

                                                    <td className="px-6 py-4 font-bold text-gray-600">{rent}</td>

                                                    <td className="px-6 py-4 font-bold text-gray-600">{moveOut}</td>

                                                    <td className="px-6 py-4 font-bold text-gray-600">{booking}</td>

                                                    <td className="px-6 py-4 font-bold text-gray-600">{unpaid}</td>

                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => nav(`/owner/rooms/${roomId}`, { state: { condoId } })}
                                                            className="font-extrabold text-gray-700 underline underline-offset-4 hover:text-gray-900"
                                                        >
                                                            รายละเอียด
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* modal */}
            {openPickRoom && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    {/* overlay */}
                    <button
                        type="button"
                        onClick={() => setOpenPickRoom(false)}
                        className="absolute inset-0 bg-black/30"
                        aria-label="close"
                    />

                    {/* modal */}
                    <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
                        <div className="px-6 py-4 bg-[#EAF2FF] border-b border-blue-100">
                            <div className="text-lg font-extrabold text-gray-900">เลือกห้องเพื่อสร้างรหัสเข้าสู่ระบบ</div>
                            <div className="text-sm font-bold text-gray-600 mt-1">
                                เลือกห้อง แล้วระบบจะพาไปกรอกสัญญา (MonthlyContractPage)
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <div className="text-sm font-extrabold text-gray-800 mb-2">เลือกห้อง</div>
                                <select
                                    value={pickRoomId}
                                    onChange={(e) => setPickRoomId(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                             focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                >
                                    <option value="">-- กรุณาเลือกห้อง --</option>
                                    {rooms.map((r: any) => (
                                        <option key={String(r.id)} value={String(r.id)}>
                                            ห้อง {r.roomNo ?? "-"} (ชั้น {r.floor ?? "-"})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenPickRoom(false)}
                                    className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>

                                <button
                                    type="button"
                                    onClick={() => nav(`/owner/rooms/${pickRoomId}/monthly`, { replace: true })}
                                    disabled={!pickRoomId}
                                    className="px-6 py-3 rounded-xl !bg-blue-600 text-white font-extrabold hover:!bg-blue-700
                             disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    ต่อไป
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </OwnerShell>
    );
}