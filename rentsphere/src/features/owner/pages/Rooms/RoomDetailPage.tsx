import OwnerShell from "@/features/owner/components/OwnerShell";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";

function moneyTHB(n?: number | null) {
    if (n == null) return "-";
    return new Intl.NumberFormat("th-TH").format(n) + " บาท";
}

function StatusPill({ status }: { status?: string }) {
    const vacant = status === "VACANT";
    return (
        <span
            className={[
                "inline-flex items-center justify-center",
                "min-w-[72px] px-3 py-1 rounded-full text-xs font-extrabold",
                vacant
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200",
            ].join(" ")}
        >
            {vacant ? "ว่าง" : "ไม่ว่าง"}
        </span>
    );
}

/* ====== Calendar Icon ====== */
function CalendarIcon({ className = "h-6 w-6" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M8 2v3M16 2v3" />
            <path d="M3.5 9h17" />
            <path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5V19A2.5 2.5 0 0 1 18 21.5H6A2.5 2.5 0 0 1 3.5 19V6.5A2.5 2.5 0 0 1 6 4Z" />
            <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01" />
        </svg>
    );
}

/* ====== Types ====== */
type RoomDetail = {
    id: string;
    roomNo: string;
    price: number | null;
    status: "VACANT" | "OCCUPIED" | string;
    isActive: boolean;
    condoName?: string | null;
};

type TenantInfo = {
    dormUserId: string;
    fullName: string;
    phone: string;
    email: string;
    registeredAt: string;
    room: string;
    accessCode: string;
};

type ServiceOption = {
    id: string;
    name: string;
    price: number;
};

type MonthlyServiceRow = { id: string; name: string; price: number };

type ContractInfo = {
    id?: string;
    tenantFirstName: string;
    tenantLastName: string;
    tenantPhone: string;
    tenantCitizenId: string;
    tenantAddress: string;
    checkIn: string;
    checkOut: string | null;
    monthlyRent: number;
    deposit: number;
    depositPayBy: string;
    bookingFee: number;
    bookingNo: string | null;
    emergencyName: string | null;
    emergencyRelation: string | null;
    emergencyPhone: string | null;
    note: string | null;
};

/* ====== Backend call ====== */
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

/** หา condoId — ลำดับ: 1) navigation state  2) localStorage  3) wizard store  4) API /condos/mine */
async function resolveCondoId(stateCondoId?: string | null): Promise<string> {
    if (stateCondoId) return stateCondoId;

    // fallback 1: localStorage (จากหน้าเลือกคอนโด)
    const lsCondoId = localStorage.getItem("rentsphere_selected_condo");
    if (lsCondoId) return lsCondoId;

    // fallback 2: wizard store
    try {
        const raw = localStorage.getItem("rentsphere_condo_wizard");
        if (raw) {
            const id = JSON.parse(raw)?.state?.condoId;
            if (id) return id;
        }
    } catch { }

    // fallback 3: API
    try {
        const res = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() });
        if (res.ok) {
            const data = await res.json();
            const c = data.condo || (data.condos && data.condos[0]);
            if (c?.id) return String(c.id);
        }
    } catch { }

    throw new Error("ไม่พบ condoId — กรุณาเลือกคอนโดก่อน");
}

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

    // ดึงชื่อคอนโด
    let condoName = "คอนโดมิเนียม";
    try {
        const cRes = await fetch(`${API}/api/v1/condos/mine`, { method: "GET", headers: authHeaders() });
        if (cRes.ok) {
            const cData = await cRes.json();
            const list = cData.condos || (cData.condo ? [cData.condo] : []);
            const c = list.find((x: any) => String(x.id) === condoId) || list[0];
            if (c) condoName = c.name_th || c.nameTh || c.name || condoName;
        }
    } catch { }

    return {
        id: String(r.id),
        roomNo: String(r.room_no || r.roomNo || "-"),
        price: r.price != null ? Number(r.price) : null,
        status: String(r.status || "VACANT"),
        isActive: r.is_active ?? r.isActive ?? true,
        condoName,
    };
}

/* ====== Services backend  ====== */
async function fetchServiceOptions(_roomId: string, condoId: string): Promise<ServiceOption[]> {
    if (!condoId) return [];

    try {
        const res = await fetch(`${API}/api/v1/condos/${condoId}/services`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const services: any[] = data.services || [];
        return services.map((s: any) => ({
            id: String(s.id),
            name: s.name || s.service_name || "—",
            price: Number(s.price || s.monthly_price || 0),
        }));
    } catch { return []; }
}

async function saveMonthlyServiceForRoom(_roomId: string, _serviceId: string) {
    // ยังไม่มี endpoint เฉพาะ — saved locally for now
    return;
}

/** ดึงข้อมูลสัญญาของห้อง */
async function fetchContractForRoom(roomId: string, condoId: string): Promise<ContractInfo | null> {
    try {
        const res = await fetch(`${API}/api/v1/condos/${condoId}/contracts?roomId=${encodeURIComponent(roomId)}`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const c = data.contract || (data.contracts && data.contracts[0]) || null;
        if (!c) return null;

        // handle tenant_name (single field) vs tenantFirstName/tenantLastName
        let fName = c.tenantFirstName || c.tenant_first_name || "";
        let lName = c.tenantLastName || c.tenant_last_name || "";
        if (!fName && c.tenant_name) {
            const parts = String(c.tenant_name).trim().split(/\s+/);
            fName = parts[0] || "";
            lName = parts.slice(1).join(" ") || "";
        }

        return {
            id: c.id || undefined,
            tenantFirstName: fName,
            tenantLastName: lName,
            tenantPhone: c.tenantPhone || c.tenant_phone || "",
            tenantCitizenId: c.tenantCitizenId || c.tenant_citizen_id || "",
            tenantAddress: c.tenantAddress || c.tenant_address || "",
            checkIn: c.checkIn || c.check_in || c.start_date || "",
            checkOut: c.checkOut || c.check_out || c.end_date || null,
            monthlyRent: Number(c.monthlyRent ?? c.monthly_rent ?? c.rent ?? 0),
            deposit: Number(c.deposit ?? 0),
            depositPayBy: c.depositPayBy || c.deposit_pay_by || "เงินสด",
            bookingFee: Number(c.bookingFee ?? c.booking_fee ?? 0),
            bookingNo: c.bookingNo || c.booking_no || null,
            emergencyName: c.emergencyName || c.emergency_name || null,
            emergencyRelation: c.emergencyRelation || c.emergency_relation || null,
            emergencyPhone: c.emergencyPhone || c.emergency_phone || null,
            note: c.note || null,
        };
    } catch {
        return null;
    }
}

/** ดึงมิเตอร์ของห้อง */
type MeterReading = { type: string; value: number; recordedAt: string };
async function fetchMeterReadings(roomId: string, condoId: string): Promise<MeterReading[]> {
    try {
        const res = await fetch(`${API}/api/v1/condos/${condoId}/meters?roomId=${encodeURIComponent(roomId)}`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const meters: any[] = data.meters || data.readings || [];
        return meters.map((m: any) => ({
            type: m.type || "",
            value: Number(m.currentReading ?? m.current_reading ?? m.reading ?? m.value ?? 0),
            recordedAt: m.recordedAt || m.recorded_at || m.created_at || "",
        }));
    } catch {
        return [];
    }
}

/** ดึง invoices ของห้อง */
type InvoiceInfo = { id: string; totalAmount: number; dueDate: string; note: string; status: string; createdAt: string };
async function fetchInvoicesForRoom(roomId: string, condoId: string): Promise<InvoiceInfo[]> {
    try {
        const res = await fetch(`${API}/api/v1/condos/${condoId}/invoices?roomId=${encodeURIComponent(roomId)}`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const inv: any[] = data.invoices || [];
        return inv.map((i: any) => ({
            id: i.id || "",
            totalAmount: Number(i.total_amount ?? i.totalAmount ?? 0),
            dueDate: i.due_date || i.dueDate || "",
            note: i.note || "",
            status: i.status || "pending",
            createdAt: i.created_at || i.createdAt || "",
        }));
    } catch {
        return [];
    }
}

function fmtDate(d: string | null | undefined) {
    if (!d) return "—";
    try {
        return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
    } catch { return d; }
}

/** ดึงข้อมูลผู้เช่าที่ผูกกับห้องนี้ */
async function fetchTenantForRoom(roomNo: string, condoId: string): Promise<TenantInfo | null> {
    try {
        const res = await fetch(`${API}/admin/tenants?condoId=${encodeURIComponent(condoId)}`, {
            method: "GET",
            headers: authHeaders(),
        });
        if (!res.ok) {
            console.warn("[fetchTenantForRoom] API failed:", res.status);
            return null;
        }
        const data = await res.json();
        // backend ส่งกลับ { ok, items } — fallback อ่าน tenants/array ด้วย
        const tenants: any[] = data.items || data.tenants || (Array.isArray(data) ? data : []);
        console.log("[fetchTenantForRoom] roomNo=", roomNo, "tenants=", tenants.length, tenants.map((t: any) => t.room));

        // เทียบ roomNo แบบ trim + string
        const t = tenants.find((x: any) => String(x.room ?? "").trim() === String(roomNo).trim());
        if (!t) {
            console.warn("[fetchTenantForRoom] ไม่พบผู้เช่าในห้อง", roomNo);
            return null;
        }
        return {
            dormUserId: String(t.id || ""),
            fullName: t.full_name || "ผู้เช่า",
            phone: t.phone || "—",
            email: t.email || "—",
            registeredAt: t.registered_at || t.created_at || "—",
            room: t.room || roomNo,
            accessCode: t.code || t.access_code || "—",
        };
    } catch (e) {
        console.error("[fetchTenantForRoom] error:", e);
        return null;
    }
}

/** ยุติสัญญา — ลบ dorm_user + เปลี่ยนห้องกลับเป็น VACANT */
async function terminateContract(dormUserId: string, roomId: string, condoId: string): Promise<void> {
    // 1) ลบ dorm_user
    const r1 = await fetch(`${API}/admin/terminate-contract`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ dormUserId, roomId, condoId }),
    });
    if (!r1.ok) {
        const d = await r1.json().catch(() => ({}));
        throw new Error(d?.error || "ยุติสัญญาไม่สำเร็จ");
    }
}

export default function RoomDetailPage() {
    const nav = useNavigate();
    const { roomId } = useParams();
    const location = useLocation();
    const stateCondoId = (location.state as any)?.condoId as string | undefined;

    const btnPrimary =
        "inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(37,99,235,0.18)] hover:bg-blue-700 active:scale-[0.99] transition";

    const tableHead = "bg-[#F3F7FF] text-gray-800 border-b border-blue-100/70";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [room, setRoom] = useState<RoomDetail | null>(null);

    // ===== services  =====
    const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
    const [serviceLoading, setServiceLoading] = useState(false);

    const [selectedServiceId, setSelectedServiceId] = useState<string>("");
    const selectedService = useMemo(
        () => serviceOptions.find((s) => s.id === selectedServiceId) ?? null,
        [serviceOptions, selectedServiceId]
    );

    // list ของบริการที่ผูกแล้ว
    const [monthlyServices, setMonthlyServices] = useState<MonthlyServiceRow[]>([]);

    // ===== tenant info =====
    const [tenant, setTenant] = useState<TenantInfo | null>(null);
    const [contract, setContract] = useState<ContractInfo | null>(null);
    const [meters, setMeters] = useState<MeterReading[]>([]);
    const [invoices, setInvoices] = useState<InvoiceInfo[]>([]);
    const [showTerminateModal, setShowTerminateModal] = useState(false);
    const [terminating, setTerminating] = useState(false);
    const [resolvedCondoId, setResolvedCondoId] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!roomId) {
                setLoading(false);
                setRoom(null);
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

                // โหลดข้อมูลผู้เช่า + สัญญา + มิเตอร์ + ใบแจ้ง (ถ้าห้องไม่ว่าง)
                if (data.status !== "VACANT") {
                    const [t, ct, mt, inv] = await Promise.all([
                        fetchTenantForRoom(data.roomNo, condoId),
                        fetchContractForRoom(roomId, condoId),
                        fetchMeterReadings(roomId, condoId),
                        fetchInvoicesForRoom(roomId, condoId),
                    ]);
                    if (!cancelled) {
                        setTenant(t);
                        setContract(ct);
                        setMeters(mt);
                        setInvoices(inv);
                    }
                } else {
                    setTenant(null);
                    setContract(null);
                    setMeters([]);
                    setInvoices([]);
                }

                //โหลดรายการบริการ (backend)
                setServiceLoading(true);
                const services = await fetchServiceOptions(roomId, condoId);
                if (cancelled) return;
                setServiceOptions(services);

                // เลือก default อัตโนมัติถ้ามีบริการ
                setSelectedServiceId((prev) => {
                    if (prev) return prev;
                    return services[0]?.id ?? "";
                });

                setServiceLoading(false);
                setLoading(false);
            } catch (e: any) {
                if (cancelled) return;
                setRoom(null);
                setError(e?.message ?? "เกิดข้อผิดพลาด");
                setServiceLoading(false);
                setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [roomId]);

    const condoName = room?.condoName ?? "คอนโดมิเนียม";
    const roomNo = room?.roomNo ?? "-";
    const roomPrice = room?.price ?? null;
    const roomStatus = room?.status ?? (room?.isActive ? "VACANT" : "OCCUPIED");

    // ===== Booking modal + rows (โครง UI) =====
    const [openBookingModal, setOpenBookingModal] = useState(false);

    type BookingRow = {
        ref: string;
        customer: string;
        checkIn: string;
        price: number;
        deposit: number;
        status: string;
    };

    const [bookingRows, setBookingRows] = useState<BookingRow[]>([]);
    const [bkRef, setBkRef] = useState("");
    const [bkCustomer, setBkCustomer] = useState("");
    const [bkCheckIn, setBkCheckIn] = useState("");
    const [bkPrice, setBkPrice] = useState<number>(Number(roomPrice ?? 0) || 0);
    const [bkDeposit, setBkDeposit] = useState<number>(0);
    const [bkStatus, setBkStatus] = useState<string>("รอเข้าพัก");

    useEffect(() => {
        setBkPrice(Number(roomPrice ?? 0) || 0);
    }, [roomPrice]);

    const resetBookingForm = () => {
        setBkRef("");
        setBkCustomer("");
        setBkCheckIn("");
        setBkPrice(Number(roomPrice ?? 0) || 0);
        setBkDeposit(0);
        setBkStatus("รอเข้าพัก");
    };

    const openBooking = () => {
        resetBookingForm();
        setOpenBookingModal(true);
    };

    const saveBooking = () => {
        // TODO: POST booking
        if (!bkCustomer.trim()) return alert("กรุณากรอกชื่อลูกค้า");
        if (!bkCheckIn) return alert("กรุณาเลือกวันที่เข้าพัก");

        const ref = bkRef.trim()
            ? bkRef.trim()
            : `BK-${new Date().toISOString().slice(0, 10)}-${String(bookingRows.length + 1).padStart(3, "0")}`;

        setBookingRows((prev) => [
            ...prev,
            {
                ref,
                customer: bkCustomer.trim(),
                checkIn: bkCheckIn,
                price: Number.isFinite(bkPrice) ? bkPrice : 0,
                deposit: Number.isFinite(bkDeposit) ? bkDeposit : 0,
                status: bkStatus || "รอเข้าพัก",
            },
        ]);

        setOpenBookingModal(false);
    };

    // ===== moved out  =====
    const movedOutRows: Array<{ inDate: string; customer: string; outDate: string }> = [];

    const addMonthlyService = async () => {
        if (!roomId) return;
        if (!selectedService) return;

        // TODO: call backend to attach service to room
        await saveMonthlyServiceForRoom(roomId, selectedService.id);

        // UI update
        setMonthlyServices((prev) => {
            if (prev.some((x) => x.id === selectedService.id)) return prev;
            return [...prev, selectedService];
        });
    };

    if (loading) {
        return (
            <OwnerShell title={undefined} activeKey="rooms" showSidebar>
                <div className="rounded-2xl border border-blue-100/70 bg-white p-8">
                    <div className="text-sm font-extrabold text-gray-600">กำลังโหลดข้อมูลห้อง...</div>
                </div>
            </OwnerShell>
        );
    }

    if (!roomId || error || !room) {
        return (
            <OwnerShell title={undefined} activeKey="rooms" showSidebar>
                <div className="rounded-2xl border border-blue-100/70 bg-white p-8">
                    <div className="text-xl font-extrabold text-gray-900 mb-2">ไม่พบข้อมูลห้องนี้</div>
                    <div className="text-gray-600 font-bold mb-2">roomId: {roomId}</div>
                    {error && <div className="text-rose-600 font-extrabold mb-6">{error}</div>}

                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => nav("/owner/rooms")} className={btnPrimary}>
                            กลับไปหน้าห้อง
                        </button>

                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center justify-center rounded-xl bg-white border border-gray-200 px-5 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-50 active:scale-[0.99] transition"
                        >
                            ลองใหม่
                        </button>
                    </div>
                </div>
            </OwnerShell>
        );
    }

    return (
        <OwnerShell title={undefined} activeKey="rooms" showSidebar>
            {/* breadcrumb */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm font-bold text-gray-600">
                    <button
                        onClick={() => nav("/owner/dashboard")}
                        className="hover:text-gray-900 underline underline-offset-4"
                        type="button"
                    >
                        หน้าหลัก
                    </button>
                    <span className="text-gray-400">{">"}</span>

                    <button
                        onClick={() => nav("/owner/rooms")}
                        className="hover:text-gray-900 underline underline-offset-4"
                        type="button"
                    >
                        {condoName}
                    </button>

                    <span className="text-gray-400">{">"}</span>
                    <span className="text-gray-900 font-extrabold">ห้อง {roomNo}</span>

                    <span className="ml-3">
                        <StatusPill status={roomStatus} />
                    </span>
                </div>

                <div className="text-sm font-bold text-gray-600">
                    ค่าเช่า: <span className="text-gray-900 font-extrabold">{moneyTHB(roomPrice)}</span>
                </div>
            </div>

            {/* ===== Contract Details (OCCUPIED) ===== */}
            {roomStatus !== "VACANT" && (contract || tenant) && (
                <div className="mb-6 rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    <div className="px-6 py-4 bg-[#F3F7FF] border-b border-blue-100/70 flex items-center justify-between">
                        <div className="text-lg font-extrabold text-gray-900">รายละเอียดสัญญา</div>
                        <StatusPill status="OCCUPIED" />
                    </div>

                    <div className="p-6">
                        {/* ===== สัญญา: วันที่ + การเงิน ===== */}
                        {contract ? (
                            <>
                                <div className="text-base font-extrabold text-gray-900 mb-4">ข้อมูลสัญญา</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">วันที่เข้าพัก</div>
                                        <div className="text-base font-extrabold text-gray-900">{fmtDate(contract.checkIn)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">วันที่ออก</div>
                                        <div className="text-base font-bold text-gray-700">{fmtDate(contract.checkOut)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ค่าเช่าต่อเดือน</div>
                                        <div className="text-base font-extrabold text-blue-700">{moneyTHB(contract.monthlyRent)} บาท</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">เงินประกัน</div>
                                        <div className="text-base font-extrabold text-gray-900">{moneyTHB(contract.deposit)} บาท</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ชำระประกันโดย</div>
                                        <div className="text-base font-bold text-gray-700">{contract.depositPayBy || "—"}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">เงินจอง</div>
                                        <div className="text-base font-bold text-gray-700">{moneyTHB(contract.bookingFee)} บาท</div>
                                    </div>
                                    {contract.bookingNo && (
                                        <div>
                                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">เลขที่ใบจอง</div>
                                            <div className="text-base font-bold text-gray-700">{contract.bookingNo}</div>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-gray-200 my-5" />

                                {/* ===== ข้อมูลผู้เช่า (จากสัญญา) ===== */}
                                <div className="text-base font-extrabold text-gray-900 mb-4">ข้อมูลผู้เช่า</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ชื่อ-สกุล</div>
                                        <div className="text-base font-extrabold text-gray-900">
                                            {`${contract.tenantFirstName} ${contract.tenantLastName}`.trim() || tenant?.fullName || "—"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">เบอร์ติดต่อ</div>
                                        <div className="text-base font-bold text-gray-700">{contract.tenantPhone || tenant?.phone || "—"}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">เลขบัตรประชาชน</div>
                                        <div className="text-base font-bold text-gray-700">{contract.tenantCitizenId || "—"}</div>
                                    </div>
                                    {contract.tenantAddress && (
                                        <div className="lg:col-span-3">
                                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ที่อยู่</div>
                                            <div className="text-base font-bold text-gray-700">{contract.tenantAddress}</div>
                                        </div>
                                    )}
                                </div>

                                {/* ===== บุคคลติดต่อฉุกเฉิน ===== */}
                                {(contract.emergencyName || contract.emergencyPhone) && (
                                    <>
                                        <div className="h-px bg-gray-200 my-5" />
                                        <div className="text-base font-extrabold text-gray-900 mb-4">บุคคลติดต่อฉุกเฉิน</div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ชื่อ</div>
                                                <div className="text-base font-bold text-gray-700">{contract.emergencyName || "—"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ความสัมพันธ์</div>
                                                <div className="text-base font-bold text-gray-700">{contract.emergencyRelation || "—"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">เบอร์ติดต่อ</div>
                                                <div className="text-base font-bold text-gray-700">{contract.emergencyPhone || "—"}</div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* ===== Note ===== */}
                                {contract.note && (
                                    <>
                                        <div className="h-px bg-gray-200 my-5" />
                                        <div className="text-base font-extrabold text-gray-900 mb-2">หมายเหตุ</div>
                                        <div className="text-sm font-bold text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{contract.note}</div>
                                    </>
                                )}
                            </>
                        ) : tenant ? (
                            /* ===== Fallback: แสดงข้อมูลจาก dorm_users ===== */
                            <>
                                <div className="text-base font-extrabold text-gray-900 mb-4">ข้อมูลผู้เช่า</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ชื่อ-สกุล</div>
                                        <div className="text-base font-extrabold text-gray-900">{tenant.fullName}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ห้อง</div>
                                        <div className="text-base font-extrabold text-gray-900">{tenant.room}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">โทรศัพท์</div>
                                        <div className="text-base font-bold text-gray-700">{tenant.phone}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">อีเมล</div>
                                        <div className="text-base font-bold text-gray-700">{tenant.email}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">รหัสเข้าใช้งาน</div>
                                        <div className="text-base font-bold text-gray-700 font-mono">{tenant.accessCode}</div>
                                    </div>
                                </div>
                            </>
                        ) : null}

                        {/* ===== ปุ่มยุติสัญญา ===== */}
                        <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => setShowTerminateModal(true)}
                                className={[
                                    "inline-flex items-center gap-2 px-6 py-3 rounded-xl",
                                    "bg-rose-600 text-white font-extrabold text-sm",
                                    "shadow-[0_10px_20px_rgba(225,29,72,0.2)]",
                                    "hover:bg-rose-700 active:scale-[0.98] transition",
                                ].join(" ")}
                            >
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                ยุติสัญญา
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== มิเตอร์ + ค่าเช่าล่วงหน้า (OCCUPIED only) ===== */}
            {roomStatus !== "VACANT" && (meters.length > 0 || invoices.length > 0) && (
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* มิเตอร์เริ่มต้น */}
                    {meters.length > 0 && (
                        <div className="rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-sm">
                            <div className="px-6 py-4 bg-[#F3F7FF] border-b border-blue-100/70">
                                <div className="text-base font-extrabold text-gray-900">มิเตอร์เริ่มต้น</div>
                            </div>
                            <div className="p-5">
                                <div className="space-y-3">
                                    {meters.map((m, i) => (
                                        <div key={i} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className={[
                                                    "inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg",
                                                    m.type === "water"
                                                        ? "bg-sky-100 text-sky-600"
                                                        : "bg-amber-100 text-amber-600",
                                                ].join(" ")}>
                                                    {m.type === "water" ? "💧" : "⚡"}
                                                </span>
                                                <div>
                                                    <div className="text-sm font-extrabold text-gray-800">
                                                        {m.type === "water" ? "ค่าน้ำ" : m.type === "electricity" ? "ค่าไฟ" : m.type}
                                                    </div>
                                                    {m.recordedAt && (
                                                        <div className="text-xs font-bold text-gray-400">{fmtDate(m.recordedAt)}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-lg font-extrabold text-gray-900">{m.value.toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ค่าเช่าล่วงหน้า / Invoices */}
                    {invoices.length > 0 && (
                        <div className="rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-sm">
                            <div className="px-6 py-4 bg-[#F3F7FF] border-b border-blue-100/70">
                                <div className="text-base font-extrabold text-gray-900">ค่าเช่าล่วงหน้า / ใบแจ้งหนี้</div>
                            </div>
                            <div className="p-5">
                                <div className="space-y-3">
                                    {invoices.map((inv) => (
                                        <div key={inv.id} className="rounded-xl bg-gray-50 px-4 py-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="text-sm font-extrabold text-gray-800">{inv.note || "ค่าเช่าล่วงหน้า"}</div>
                                                <div className="text-base font-extrabold text-blue-700">{moneyTHB(inv.totalAmount)} บาท</div>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-bold text-gray-400">
                                                {inv.dueDate && <span>ครบกำหนด: {fmtDate(inv.dueDate)}</span>}
                                                <span className={[
                                                    "px-2 py-0.5 rounded-full text-xs font-extrabold",
                                                    inv.status === "paid"
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-amber-100 text-amber-700",
                                                ].join(" ")}>
                                                    {inv.status === "paid" ? "ชำระแล้ว" : "รอชำระ"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* รายละเอียดสัญญา — ปุ่มรายเดือน (เฉพาะห้องว่าง) */}
                {roomStatus === "VACANT" && (
                    <div className="rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-[#F3F7FF] border-b border-blue-100/70">
                            <div className="text-lg font-extrabold text-gray-900 text-center">รายละเอียดสัญญา</div>
                        </div>

                        <div className="p-10 flex items-center justify-center">
                            <button
                                type="button"
                                className={[
                                    "w-full max-w-sm",
                                    "rounded-2xl",
                                    "!bg-gradient-to-r !from-blue-600 !to-sky-500",
                                    "text-white",
                                    "px-7 py-6",
                                    "flex items-center justify-center gap-3",
                                    "font-extrabold",
                                    "shadow-[0_18px_30px_rgba(37,99,235,0.25)]",
                                    "hover:brightness-110 hover:shadow-[0_22px_36px_rgba(37,99,235,0.28)]",
                                    "active:scale-[0.99] transition",
                                    "focus:outline-none focus-visible:ring-4 focus-visible:!ring-blue-200/70",
                                ].join(" ")}
                                onClick={() => nav(`/owner/rooms/${roomId}/monthly`, { state: { condoId: resolvedCondoId } })}
                            >
                                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                                    <CalendarIcon className="h-6 w-6 text-white" />
                                </span>

                                <span className="text-xl tracking-wide">รายเดือน</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ค่าบริการรายเดือน */}
                <div className="rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-sm">
                    <div className="px-6 py-4 bg-[#F3F7FF] border-b border-blue-100/70">
                        <div className="text-lg font-extrabold text-gray-900 text-center">ค่าบริการรายเดือน</div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="flex gap-3">
                            <select
                                value={selectedServiceId}
                                onChange={(e) => setSelectedServiceId(e.target.value)}
                                disabled={serviceLoading || serviceOptions.length === 0}
                                className={[
                                    "flex-1 rounded-xl",
                                    "border border-blue-100 bg-white",
                                    "px-4 py-3",
                                    "font-bold text-gray-800",
                                    "focus:outline-none focus:ring-4 focus:ring-blue-200/60",
                                    (serviceLoading || serviceOptions.length === 0) ? "opacity-70" : "",
                                ].join(" ")}
                            >
                                {serviceLoading ? (
                                    <option value="">กำลังโหลดบริการ...</option>
                                ) : serviceOptions.length === 0 ? (
                                    <option value="">ยังไม่มีบริการ (รอเชื่อม Step 1 / backend)</option>
                                ) : (
                                    serviceOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))
                                )}
                            </select>

                            <button
                                type="button"
                                onClick={addMonthlyService}
                                disabled={!selectedServiceId || serviceOptions.length === 0}
                                className={[
                                    "h-[52px] min-w-[88px] rounded-xl font-extrabold",
                                    "shadow-[0_10px_20px_rgba(37,99,235,0.22)] border border-blue-700/10",
                                    "focus:outline-none focus-visible:ring-4 focus-visible:!ring-blue-200/70",
                                    (!selectedServiceId || serviceOptions.length === 0)
                                        ? "bg-blue-200 text-white/70 cursor-not-allowed shadow-none"
                                        : "!bg-blue-600 text-white hover:!bg-blue-700 active:scale-[0.99] transition",
                                ].join(" ")}
                            >
                                เพิ่ม
                            </button>
                        </div>

                        <div className="rounded-xl border border-blue-100 overflow-hidden">
                            <div className="grid grid-cols-2 bg-[#F3F7FF] px-4 py-3 text-sm font-extrabold text-gray-700 border-b border-blue-100/70">
                                <div>ค่าบริการ</div>
                                <div className="text-right">ราคา</div>
                            </div>

                            {monthlyServices.length === 0 ? (
                                <div className="px-4 py-4 text-sm font-bold text-gray-500">
                                    ยังไม่มีค่าบริการรายเดือน (รอ backend ผูกบริการเข้าห้อง)
                                </div>
                            ) : (
                                monthlyServices.map((s) => (
                                    <div key={s.id} className="grid grid-cols-2 px-4 py-3 border-t border-blue-50 text-sm">
                                        <div className="font-bold text-gray-800">{s.name}</div>
                                        <div className="text-right font-extrabold text-gray-900">{moneyTHB(s.price)}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Booking ===== */}
            <div className="mt-6 rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-blue-100/70">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-lg font-extrabold text-gray-900">รายชื่อคนจองรอเข้าพัก</div>
                            <div className="text-sm font-bold text-gray-500 mt-1">เพิ่มรายการจองก่อนเข้าพัก</div>
                        </div>

                        <button
                            type="button"
                            onClick={openBooking}
                            className={[
                                "h-[52px] min-w-[88px]",
                                "rounded-xl",
                                "!bg-blue-600 text-white",
                                "font-extrabold",
                                "shadow-[0_10px_20px_rgba(37,99,235,0.22)]",
                                "border border-blue-700/10",
                                "hover:!bg-blue-700 active:scale-[0.99] transition",
                                "focus:outline-none focus-visible:ring-4 focus-visible:!ring-blue-200/70",
                            ].join(" ")}
                        >
                            เพิ่ม
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    <div className="w-full overflow-x-auto">
                        <table className="min-w-[980px] w-full text-sm">
                            <thead>
                                <tr className={tableHead}>
                                    <th className="px-6 py-4 font-extrabold rounded-l-xl">เลขที่/วันที่จอง</th>
                                    <th className="px-6 py-4 font-extrabold">ลูกค้า</th>
                                    <th className="px-6 py-4 font-extrabold">วันที่เข้าพัก</th>
                                    <th className="px-6 py-4 font-extrabold">ราคา</th>
                                    <th className="px-6 py-4 font-extrabold">เงินจอง</th>
                                    <th className="px-6 py-4 font-extrabold rounded-r-xl">สถานะ</th>
                                </tr>
                            </thead>

                            <tbody>
                                {bookingRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-gray-500 font-bold">
                                            ยังไม่มีรายการจอง (รอ backend)
                                        </td>
                                    </tr>
                                ) : (
                                    bookingRows.map((r) => (
                                        <tr key={r.ref} className="border-b border-blue-50">
                                            <td className="px-6 py-4 font-bold">{r.ref}</td>
                                            <td className="px-6 py-4 font-bold">{r.customer}</td>
                                            <td className="px-6 py-4 font-bold">{r.checkIn}</td>
                                            <td className="px-6 py-4 font-extrabold">{moneyTHB(r.price)}</td>
                                            <td className="px-6 py-4 font-extrabold">{moneyTHB(r.deposit)}</td>
                                            <td className="px-6 py-4 font-bold">{r.status}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ===== Moved out ===== */}
            <div className="mt-6 rounded-2xl border border-blue-100/70 bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-blue-100/70">
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-extrabold text-gray-900">สัญญาที่ย้ายออก</div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="w-full overflow-x-auto">
                        <table className="min-w-[820px] w-full text-sm">
                            <thead>
                                <tr className={tableHead}>
                                    <th className="px-6 py-4 font-extrabold rounded-l-xl">วันที่เข้า</th>
                                    <th className="px-6 py-4 font-extrabold">ลูกค้า</th>
                                    <th className="px-6 py-4 font-extrabold rounded-r-xl">แจ้งออก ณ วันที่</th>
                                </tr>
                            </thead>

                            <tbody>
                                {movedOutRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-10 text-gray-500 font-bold">
                                            ยังไม่มีประวัติย้ายออก (รอ backend)
                                        </td>
                                    </tr>
                                ) : (
                                    movedOutRows.map((r, i) => (
                                        <tr key={i} className="border-b border-blue-50">
                                            <td className="px-6 py-4 font-bold">{r.inDate}</td>
                                            <td className="px-6 py-4 font-bold">{r.customer}</td>
                                            <td className="px-6 py-4 font-bold">{r.outDate}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ===== Booking Modal ===== */}
            {openBookingModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <button
                        type="button"
                        onClick={() => setOpenBookingModal(false)}
                        className="absolute inset-0 bg-black/30"
                        aria-label="close"
                    />

                    <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
                        <div className="px-6 py-4 bg-[#EAF2FF] border-b border-blue-100">
                            <div className="text-lg font-extrabold text-gray-900">เพิ่มรายการจองก่อนเข้าพัก</div>
                            <div className="text-sm font-bold text-gray-600 mt-1">กรอกข้อมูลสำหรับการจองของห้อง {roomNo}</div>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                <div className="lg:col-span-2">
                                    <div className="text-sm font-extrabold text-gray-800 mb-2">เลขที่/วันที่จอง</div>
                                    <input
                                        value={bkRef}
                                        onChange={(e) => setBkRef(e.target.value)}
                                        placeholder="ปล่อยว่างได้ ระบบจะสร้างให้อัตโนมัติ"
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                               focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                    />
                                </div>

                                <div className="lg:col-span-2">
                                    <div className="text-sm font-extrabold text-gray-800 mb-2">
                                        ลูกค้า <span className="text-rose-600">*</span>
                                    </div>
                                    <input
                                        value={bkCustomer}
                                        onChange={(e) => setBkCustomer(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                                focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                    />
                                </div>

                                <div>
                                    <div className="text-sm font-extrabold text-gray-800 mb-2">
                                        วันที่เข้าพัก <span className="text-rose-600">*</span>
                                    </div>
                                    <input
                                        type="date"
                                        value={bkCheckIn}
                                        onChange={(e) => setBkCheckIn(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                               focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                    />
                                </div>

                                <div>
                                    <div className="text-sm font-extrabold text-gray-800 mb-2">สถานะ</div>
                                    <select
                                        value={bkStatus}
                                        onChange={(e) => setBkStatus(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                               focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                    >
                                        <option value="รอเข้าพัก">รอเข้าพัก</option>
                                        <option value="ยืนยันแล้ว">ยืนยันแล้ว</option>
                                        <option value="ยกเลิก">ยกเลิก</option>
                                    </select>
                                </div>

                                <div>
                                    <div className="text-sm font-extrabold text-gray-800 mb-2">ราคา</div>
                                    <div className="flex items-stretch">
                                        <input
                                            value={bkPrice}
                                            onChange={(e) => setBkPrice(Number(e.target.value || 0))}
                                            inputMode="numeric"
                                            className="w-full rounded-l-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                                 focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                        />
                                        <div className="rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 px-4 py-3 font-extrabold text-gray-700">
                                            บาท
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-sm font-extrabold text-gray-800 mb-2">เงินจอง</div>
                                    <div className="flex items-stretch">
                                        <input
                                            value={bkDeposit}
                                            onChange={(e) => setBkDeposit(Number(e.target.value || 0))}
                                            inputMode="numeric"
                                            className="w-full rounded-l-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-800
                                 focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                                        />
                                        <div className="rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 px-4 py-3 font-extrabold text-gray-700">
                                            บาท
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenBookingModal(false)}
                                    className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>

                                <button
                                    type="button"
                                    onClick={saveBooking}
                                    className="px-6 py-3 rounded-xl !bg-blue-600 text-white font-extrabold hover:!bg-blue-700"
                                >
                                    บันทึก
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Terminate Contract Modal ===== */}
            {showTerminateModal && tenant && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <button
                        type="button"
                        onClick={() => setShowTerminateModal(false)}
                        className="absolute inset-0 bg-black/30"
                        aria-label="close"
                    />

                    <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-rose-100 overflow-hidden">
                        <div className="px-6 py-5 bg-rose-50 border-b border-rose-100">
                            <div className="text-lg font-extrabold text-rose-800">⚠️ ยืนยันการยุติสัญญา</div>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="text-sm font-bold text-gray-700">
                                คุณต้องการยุติสัญญาของ <span className="text-gray-900 font-extrabold">{
                                    tenant?.fullName
                                    || (contract ? `${contract.tenantFirstName} ${contract.tenantLastName}`.trim() : "ผู้เช่า")
                                }</span> ห้อง <span className="text-gray-900 font-extrabold">{tenant?.room || roomNo}</span> ใช่หรือไม่?
                            </div>
                            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-bold text-amber-800">
                                การดำเนินการนี้จะ:
                                <ul className="list-disc pl-5 mt-2 space-y-1">
                                    <li>ลบข้อมูลผู้เช่าออกจากห้องนี้</li>
                                    <li>เปลี่ยนสถานะห้องเป็น "ว่าง"</li>
                                    <li>ยกเลิกการเข้าถึงระบบของผู้เช่า</li>
                                </ul>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowTerminateModal(false)}
                                    disabled={terminating}
                                    className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>

                                <button
                                    type="button"
                                    disabled={terminating}
                                    onClick={async () => {
                                        if (!roomId) return;
                                        setTerminating(true);
                                        try {
                                            await terminateContract(tenant?.dormUserId || "", roomId, resolvedCondoId);
                                            setShowTerminateModal(false);
                                            // reload page to reflect changes
                                            window.location.reload();
                                        } catch (e: any) {
                                            alert(e?.message || "ยุติสัญญาไม่สำเร็จ");
                                        } finally {
                                            setTerminating(false);
                                        }
                                    }}
                                    className={[
                                        "px-6 py-3 rounded-xl font-extrabold text-sm",
                                        "bg-rose-600 text-white hover:bg-rose-700",
                                        "disabled:opacity-60 disabled:cursor-not-allowed",
                                        "active:scale-[0.98] transition",
                                    ].join(" ")}
                                >
                                    {terminating ? "กำลังดำเนินการ..." : "ยืนยันยุติสัญญา"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </OwnerShell>
    );
}