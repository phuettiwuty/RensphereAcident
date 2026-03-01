import React, { useEffect, useMemo, useState } from "react";
import OwnerShell from "@/features/owner/components/OwnerShell";
import { Plus } from "lucide-react";

import { facilityService } from "./types/facility.service";
import type { Facility } from "./types/facility";
import CreateFacilityModal, { type CreateFacilityPayload } from "./CreateFacilityModal";

import {
  Calendar,
  Clock,
  Home,
  Users,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  UserX,
  Play,
  XCircle,
  ChevronLeft,
  Settings,
  Hammer,
  RefreshCcw,
} from "lucide-react";

const API = "https://backendlinefacality.onrender.com";



async function adminGet(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API}${path}${sep}t=${Date.now()}`;

  const r = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      "cache-control": "no-cache",
      Pragma: "no-cache",
      pragma: "no-cache",
    },
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
  return data;
}

async function adminPost(path: string, body?: any) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "ทำรายการไม่สำเร็จ");
  return data;
}

// ---------------- time helpers ----------------
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function fmtShortDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

// ---------------- Admin booking shape (from backend) ----------------
type AdminBooking = {
  id: string;
  facility_id: string;
  dorm_user_id: string;
  start_at: string;
  end_at: string;
  status: string; // booked | active | cancelled | finished
  note?: string | null;
  checked_in_at?: string | null;
  finished_at?: string | null;
  created_at?: string;

  // optional join
  tenant?: {
    full_name?: string | null;
    room?: string | null;
    phone?: string | null;
    line_user_id?: string | null;
  };

  // optional (ถ้า backend มี)
  people_count?: number | null;
};

// ---------------- UI pieces (ตามตัวอย่าง) ----------------
const StatCard = ({
  icon: Icon,
  label,
  value,
  colorClass,
  iconBg,
}: {
  icon: any;
  label: string;
  value: number | string;
  colorClass: string;
  iconBg: string;
}) => (
  <div className="bg-white rounded-[2rem] p-6 flex items-center gap-4 shadow-sm border border-slate-100 flex-1 min-w-[200px]">
    <div className={`${iconBg} p-4 rounded-2xl`}>
      <Icon className={colorClass} size={24} />
    </div>
    <div>
      <div className="text-slate-500 text-sm font-medium">{label}</div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
    </div>
  </div>
);

function avatarBgFromString(s: string) {
  const colors = ["bg-indigo-500", "bg-rose-500", "bg-emerald-500", "bg-orange-500", "bg-violet-500", "bg-slate-700"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

type UIBooking = {
  id: string;
  date: string;
  timeRange: string;
  room: string;
  peopleCount: number | null;
  status: "waiting" | "approved" | "finished" | "cancelled"; // map
  rawStatus: string;
  user: { name: string; id: string; avatarBg: string };
  start_at: string;
  end_at: string;
  checked_in_at?: string | null;
  finished_at?: string | null;
};

const BookingRow: React.FC<{
  booking: UIBooking;
  onNoShow: (id: string) => void;
  onCheckIn: (id: string) => void;
  onFinish: (id: string) => void;
  onCancel: (id: string) => void;
  disabled?: boolean;
}> = ({ booking, onNoShow, onCheckIn, onFinish, onCancel, disabled }) => {
  const isApproved = booking.status === "approved";
  const isWaiting = booking.status === "waiting";

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="py-6 px-4">
        <div className="flex items-center gap-3">
          <div className="text-indigo-400">
            <Calendar size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-800">{booking.date}</span>
            <div className="flex items-center gap-1 text-slate-400 text-xs font-medium">
              <Clock size={12} />
              <span>{booking.timeRange}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="py-6 px-4">
        <div className="flex items-center gap-2">
          <div className="bg-rose-50 p-2 rounded-xl">
            <Home size={18} className="text-rose-400" />
          </div>
          <span className="font-bold text-rose-600">{booking.room || "-"}</span>
        </div>
      </td>

      <td className="py-6 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${booking.user.avatarBg} rounded-2xl flex items-center justify-center text-white font-bold`}>
            {booking.user.name?.charAt(0) || "?"}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-800 leading-tight">{booking.user.name || "-"}</span>
            <span className="text-slate-400 text-xs">รหัสลูกบ้าน: {booking.user.id || "-"}</span>
          </div>
        </div>
      </td>

      <td className="py-6 px-4">
        <div className="flex items-center gap-1.5 bg-rose-50 px-3 py-1.5 rounded-full w-fit">
          <Users size={14} className="text-rose-400" />
          <span className="text-rose-600 font-bold text-sm">
            {booking.peopleCount ?? "-"} <span className="font-normal text-slate-400 ml-1">ท่าน</span>
          </span>
        </div>
      </td>

      <td className="py-6 px-4">
        {isApproved ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full w-fit text-sm font-bold">
              <CheckCircle2 size={14} />
              อนุมัติแล้ว (ใช้งานจริง)
            </div>
          </div>
        ) : isWaiting ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-full w-fit text-sm font-bold">
              <Clock size={14} />
              รอเข้าใช้งาน
            </div>
            <div className="flex items-center gap-1 text-[10px] text-rose-400 font-medium">
              <AlertCircle size={10} />
              ยังไม่ check-in
            </div>
          </div>
        ) : booking.status === "finished" ? (
          <div className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full w-fit text-sm font-bold">
            <CheckCircle2 size={14} />
            ปิดรายการแล้ว
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1.5 rounded-full w-fit text-sm font-bold">
            <XCircle size={14} />
            ยกเลิก
          </div>
        )}
      </td>

      <td className="py-6 px-4">
        <div className="flex items-center gap-2 justify-end pr-8">
          {isApproved ? (
            <>
              <button
                disabled={disabled}
                onClick={() => onFinish(booking.id)}
                className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition disabled:opacity-50"
              >
                <XCircle size={16} />
                ปิดรายการ
              </button>
              <button
                disabled={disabled}
                onClick={() => onCancel(booking.id)}
                className="bg-rose-50 text-rose-500 px-3 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-100 transition disabled:opacity-50"
                title="ยกเลิก"
              >
                <UserX size={18} />
              </button>
            </>
          ) : isWaiting ? (
            <>
              <button
                disabled={disabled}
                onClick={() => onNoShow(booking.id)}
                className="bg-rose-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-rose-600 transition disabled:opacity-50"
              >
                <UserX size={16} />
                ไม่มาใช้งาน
              </button>
              <button
                disabled={disabled}
                onClick={() => onCheckIn(booking.id)}
                className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition disabled:opacity-50"
              >
                <Play size={16} fill="currentColor" />
                ใช้งานจริง
              </button>
            </>
          ) : (
            <button className="text-slate-300 hover:text-slate-500 p-1" disabled>
              <MoreHorizontal size={24} />
            </button>
          )}
          <button className="text-slate-300 hover:text-slate-500 p-1" disabled>
            <MoreHorizontal size={24} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ---------------- Dashboard View (UI ตามตัวอย่าง) ----------------
function FacilityBookingDashboard({
  facility,
  onBack,
}: {
  facility: Facility;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "waiting" | "approved">("all");
  const [dateYmd, setDateYmd] = useState(() => toYmd(new Date()));
  const [raw, setRaw] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const refresh = async () => {
    setErr("");
    setOk("");
    setLoading(true);
    try {
      const data = await adminGet(
        `/admin/facility-bookings?facility_id=${encodeURIComponent(facility.id)}&date=${encodeURIComponent(dateYmd)}`
      );
      setRaw((data.items || []) as AdminBooking[]);
    } catch (e: any) {
      setErr(e?.message || "โหลดรายการจองไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facility.id, dateYmd]);

  const uiBookings: UIBooking[] = useMemo(() => {
    return raw.map((b) => {
      const st = String(b.status || "").toLowerCase();
      const status: UIBooking["status"] =
        st === "booked" ? "waiting" :
          st === "active" ? "approved" :
            st === "finished" ? "finished" :
              "cancelled";

      const name = b.tenant?.full_name || "ไม่ระบุชื่อ";
      const uid = b.dorm_user_id || "-";
      const room = b.tenant?.room || "-";

      return {
        id: b.id,
        date: fmtShortDate(b.start_at),
        timeRange: `${fmtTime(b.start_at)} - ${fmtTime(b.end_at)}`,
        room,
        peopleCount: (b.people_count ?? null),
        status,
        rawStatus: b.status,
        user: { name, id: uid, avatarBg: avatarBgFromString(name + uid) },
        start_at: b.start_at,
        end_at: b.end_at,
        checked_in_at: b.checked_in_at,
        finished_at: b.finished_at,
      };
    });
  }, [raw]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return uiBookings;
    if (activeTab === "waiting") return uiBookings.filter((b) => b.status === "waiting");
    return uiBookings.filter((b) => b.status === "approved");
  }, [uiBookings, activeTab]);

  // Stats
  const statToday = uiBookings.length;
  const statActive = uiBookings.filter((b) => b.status === "approved").length;

  // “มาสาย” / “No show” ยังไม่มี logic exact ใน backend -> ทำเป็น 0 (ไว้ค่อยต่อเพิ่ม)
  const statLate = 0;
  const statNoShow = 0;

  const doCheckIn = async (id: string) => {
    setErr(""); setOk(""); setLoading(true);
    try {
      await adminPost(`/admin/facility-bookings/${id}/check-in`);
      setOk("✅ บันทึก: ใช้งานจริง (check-in) แล้ว");
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "check-in ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const doFinish = async (id: string) => {
    setErr(""); setOk(""); setLoading(true);
    try {
      await adminPost(`/admin/facility-bookings/${id}/finish`);
      setOk("✅ ปิดรายการแล้ว");
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "finish ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const doCancel = async (id: string) => {
    setErr(""); setOk(""); setLoading(true);
    try {
      await adminPost(`/admin/facility-bookings/${id}/cancel`);
      setOk("✅ ยกเลิกการจองแล้ว");
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "cancel ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // “ไม่มาใช้งาน” -> map เป็น cancel
  const doNoShow = async (id: string) => doCancel(id);

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition"
          >
            <ChevronLeft size={24} className="text-slate-400" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold text-slate-800">{facility.name}</h1>
              <span className="bg-emerald-50 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold border border-emerald-100 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                พร้อมให้บริการ
              </span>
            </div>
            <p className="text-slate-400 font-medium flex items-center gap-2 mt-1">
              <Calendar size={16} />
              แผงควบคุมและรายการจองรายวัน
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
            <Calendar size={18} className="text-slate-400" />
            <input
              type="date"
              value={dateYmd}
              onChange={(e) => setDateYmd(e.target.value)}
              className="font-bold text-slate-700 outline-none"
            />
          </div>

          <button
            onClick={refresh}
            className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-100 text-slate-700 font-bold flex items-center gap-2 hover:bg-slate-50 transition"
            disabled={loading}
          >
            <RefreshCcw size={20} className="text-indigo-400" />
            รีเฟรช
          </button>

          <button className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-100 text-slate-700 font-bold flex items-center gap-2 hover:bg-slate-50 transition">
            <Settings size={20} className="text-indigo-400" />
            ตั้งค่าพื้นที่
          </button>

          <button className="bg-orange-500 text-white px-6 py-3 rounded-2xl shadow-lg border-b-4 border-orange-700 font-bold flex items-center gap-2 hover:bg-orange-600 transition">
            <Hammer size={20} />
            ปิดปรับปรุงพื้นที่
          </button>
        </div>
      </div>

      {err && (
        <div className="bg-rose-50 border border-rose-100 text-rose-700 font-bold px-5 py-4 rounded-2xl">
          {err}
        </div>
      )}
      {ok && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold px-5 py-4 rounded-2xl">
          {ok}
        </div>
      )}

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard icon={Calendar} label="การจองวันนี้" value={statToday} colorClass="text-indigo-500" iconBg="bg-indigo-50" />
        <StatCard icon={Play} label="กำลังใช้งานอยู่" value={statActive} colorClass="text-emerald-500" iconBg="bg-emerald-50" />
        <StatCard icon={Clock} label="มาสาย" value={statLate} colorClass="text-orange-400" iconBg="bg-orange-50" />
        <StatCard icon={UserX} label="ไม่มา (NO SHOW)" value={statNoShow} colorClass="text-rose-500" iconBg="bg-rose-50" />
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100">
        <div className="p-8 pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-4 rounded-[1.25rem]">
              <Calendar className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">ตารางการจอง</h2>
              <div className="text-xs font-bold text-slate-400 mt-1">
                {facility.openTime} - {facility.closeTime} • {facility.slotMinutes} นาที/รอบ • {facility.capacity} คน
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 p-2 rounded-2xl">
              {(["all", "waiting", "approved"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setActiveTab(k)}
                  className={[
                    "px-4 py-2 rounded-xl text-sm font-bold transition",
                    activeTab === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white",
                  ].join(" ")}
                >
                  {k === "all" ? "ทั้งหมด" : k === "waiting" ? "รอเข้าใช้งาน" : "ใช้งานจริง"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-6 text-sm font-bold">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                <span className="text-slate-600">{uiBookings.filter((b) => b.status === "waiting").length} รอเข้าใช้งาน</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600">{uiBookings.filter((b) => b.status === "approved").length} ใช้งานจริง</span>
              </div>
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto p-8 pt-0">
          <table className="w-full text-left border-separate border-spacing-y-0">
            <thead>
              <tr className="text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="py-4 px-4 font-bold">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} /> วันที่ / เวลา
                  </div>
                </th>
                <th className="py-4 px-4">
                  <div className="flex items-center gap-1.5">
                    <Home size={14} /> ห้องพัก
                  </div>
                </th>
                <th className="py-4 px-4">
                  <div className="flex items-center gap-1.5">
                    <Users size={14} /> ผู้จอง
                  </div>
                </th>
                <th className="py-4 px-4">
                  <div className="flex items-center gap-1.5">
                    <Users size={14} /> จำนวน
                  </div>
                </th>
                <th className="py-4 px-4">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} /> สถานะ
                  </div>
                </th>
                <th className="py-4 px-4">
                  <div className="flex items-center gap-1.5 text-right justify-end pr-8">
                    <Settings size={14} /> การจัดการ
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="text-4xl mb-2">🗓️</div>
                    <div className="text-slate-800 font-extrabold">ยังไม่มีรายการ</div>
                    <div className="text-sm font-bold text-slate-500 mt-1">ลองเปลี่ยนแท็บหรือเปลี่ยนวัน</div>
                  </td>
                </tr>
              ) : (
                filtered.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    onNoShow={doNoShow}
                    onCheckIn={doCheckIn}
                    onFinish={doFinish}
                    onCancel={doCancel}
                    disabled={loading}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Button (optional aesthetic) */}
      <div className="fixed bottom-8 right-8">
        <button className="bg-slate-900 w-16 h-16 rounded-3xl shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform active:scale-95">
          <Users size={32} />
        </button>
      </div>
    </div>
  );
}

// ---------------- Main page: list facilities + open dashboard ----------------
export default function FacilityListPage() {
  const [items, setItems] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await facilityService.getFacilities();
      setItems(data);
    } catch (e: any) {
      setErr(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onCreate = async (payload: CreateFacilityPayload) => {
    setErr("");
    try {
      await facilityService.createFacility(payload);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "สร้างพื้นที่ไม่สำเร็จ");
    }
  };

  // ถ้าเลือก facility แล้ว -> ไปหน้า dashboard (UI แบบที่ขอ)
  if (selectedFacility) {
    return (
      <OwnerShell title="พื้นที่ส่วนกลาง" activeKey="common-area-booking" showSidebar>
        <FacilityBookingDashboard
          facility={selectedFacility}
          onBack={() => setSelectedFacility(null)}
        />
      </OwnerShell>
    );
  }

  return (
    <OwnerShell title="พื้นที่ส่วนกลาง" activeKey="common-area-booking" showSidebar>
      <div className="rounded-3xl border border-blue-100/60 bg-gradient-to-b from-[#EAF2FF] to-white/60 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold text-slate-900">พื้นที่ส่วนกลาง</div>
            <div className="text-sm font-bold text-slate-500">จัดการรายการพื้นที่ และกฎการจอง</div>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-white font-extrabold shadow hover:bg-indigo-700"
          >
            <Plus size={18} />
            เพิ่มพื้นที่
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700 font-bold">
            {err}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="py-16 text-center text-slate-500 font-bold">กำลังโหลด...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-2">🏟️</div>
              <div className="text-slate-800 font-extrabold">ยังไม่มีพื้นที่ส่วนกลาง</div>
              <div className="text-sm font-bold text-slate-500 mt-1">กด “เพิ่มพื้นที่” เพื่อเริ่มต้น</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((f) => (
                <div key={f.id} className="rounded-2xl bg-white border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 truncate">{f.name}</div>
                      <div className="text-xs font-bold text-slate-500 mt-1">
                        {f.openTime} - {f.closeTime} • {f.slotMinutes} นาที/รอบ • {f.capacity} คน
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-extrabold ${f.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                    >
                      {f.active ? "เปิดใช้งาน" : "ปิด"}
                    </span>
                  </div>

                  <div className="mt-3 text-sm font-semibold text-slate-700 line-clamp-2">
                    {f.description || <span className="text-slate-400">ไม่มีรายละเอียด</span>}
                  </div>

                  <div className="mt-4 text-xs font-bold text-slate-500">Auto approve: {f.isAutoApprove ? "เปิด" : "ปิด"}</div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setSelectedFacility(f)}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white font-extrabold hover:bg-slate-800"
                    >
                      <Calendar size={18} />
                      ดูการจอง (Dashboard)
                    </button>
                    <button
                      onClick={refresh}
                      className="inline-flex items-center justify-center rounded-2xl bg-white border border-slate-200 px-4 py-3 text-slate-700 font-extrabold hover:bg-slate-50"
                      title="รีเฟรช"
                    >
                      <RefreshCcw size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {open && <CreateFacilityModal onClose={() => setOpen(false)} onSave={onCreate} />}
      </div>
    </OwnerShell>
  );
}
