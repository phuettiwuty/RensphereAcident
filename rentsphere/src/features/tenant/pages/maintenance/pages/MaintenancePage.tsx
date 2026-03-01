import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Plus,
  Wrench,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";

const API = "https://backendlinefacality.onrender.com";

type Repair = {
  id: string;
  created_at: string;
  problem_type: string;
  description: string | null;
  status: string | null;
  location: string | null;
  room: string | null;
  image_url: string | null;
};

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  new: {
    label: "ใหม่",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-100",
    icon: <Clock size={14} />,
  },
  pending: {
    label: "รอดำเนินการ",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-100",
    icon: <Clock size={14} />,
  },
  in_progress: {
    label: "กำลังดำเนินการ",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    icon: <Wrench size={14} />,
  },
  กำลังดำเนินงาน: {
    label: "กำลังดำเนินการ",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    icon: <Wrench size={14} />,
  },
  done: {
    label: "เสร็จสิ้น",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    icon: <CheckCircle2 size={14} />,
  },
  เสร็จแล้ว: {
    label: "เสร็จสิ้น",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    icon: <CheckCircle2 size={14} />,
  },
  rejected: {
    label: "ปฏิเสธ",
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-100",
    icon: <XCircle size={14} />,
  },
  ปฏิเสธ: {
    label: "ปฏิเสธ",
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-100",
    icon: <XCircle size={14} />,
  },
};

function getStatusInfo(status: string | null) {
  const s = String(status || "").toLowerCase();
  return (
    statusConfig[s] || {
      label: status || "ใหม่",
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-100",
      icon: <Clock size={14} />,
    }
  );
}

const MaintenancePage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const lineUserId = localStorage.getItem("lineUserId");
      if (!lineUserId) {
        navigate("/role", { replace: true });
        return;
      }

      const r = await fetch(
        `${API}/repair/my?lineUserId=${encodeURIComponent(lineUserId)}`
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "โหลดรายการแจ้งซ่อมไม่สำเร็จ");

      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = items.filter(
    (t) => !["done", "เสร็จแล้ว", "rejected", "ปฏิเสธ"].includes(String(t.status || "").toLowerCase())
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f7ff] via-[#f0f5ff] to-white pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
        <div className="px-6 pt-8 pb-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/tenant/home")}
            className="p-2 rounded-xl bg-white shadow-sm border border-gray-100 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">รายงานซ่อมบำรุง</h1>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl bg-white shadow-sm border border-gray-100 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="px-6 pt-4">
        {/* Summary Card */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-5 mb-6 shadow-lg shadow-blue-200/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs font-bold uppercase tracking-widest">
                Repair Tickets
              </p>
              <p className="text-white text-2xl font-black mt-1">
                {items.length} รายการ
              </p>
              <p className="text-blue-200 text-sm font-medium mt-0.5">
                {pendingCount > 0
                  ? `${pendingCount} รายการรอดำเนินการ`
                  : "ไม่มีรายการค้าง"}
              </p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Wrench size={28} className="text-white" />
            </div>
          </div>
        </div>

        {/* Create New Button */}
        <button
          onClick={() => navigate("/tenant/repair-new")}
          className="w-full mb-6 py-4 bg-white rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 font-bold flex items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 active:scale-[0.98] transition-all shadow-sm"
        >
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
            <Plus size={18} />
          </div>
          แจ้งซ่อมใหม่
        </button>

        {/* Error */}
        {err && (
          <div className="mb-4 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle size={20} className="text-rose-500 shrink-0" />
            <span className="text-rose-700 text-sm font-bold">{err}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && items.length === 0 && !err && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-400 mb-4">
              <Wrench size={40} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">
              ยังไม่มีรายการแจ้งซ่อม
            </h2>
            <p className="text-gray-400 font-medium text-sm mb-6">
              กดปุ่ม "แจ้งซ่อมใหม่" เพื่อส่งคำขอ
            </p>
          </div>
        )}

        {/* Ticket List */}
        {!loading && items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                รายการทั้งหมด
              </span>
            </div>

            {items.map((t) => {
              const info = getStatusInfo(t.status);
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(`/tenant/repairs/${t.id}`)}
                  className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all active:scale-[0.98] group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 group-hover:bg-blue-100 transition-colors">
                        <Wrench size={16} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">
                          {t.problem_type || "แจ้งซ่อม"}
                        </p>
                        <p className="text-[11px] text-gray-400 font-medium">
                          {new Date(t.created_at).toLocaleDateString("th-TH", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${info.bg} ${info.color} ${info.border}`}
                    >
                      {info.icon}
                      {info.label}
                    </span>
                  </div>

                  {(t.room || t.location) && (
                    <p className="text-xs text-gray-500 font-medium ml-10">
                      {t.room ? `ห้อง ${t.room}` : ""}
                      {t.room && t.location ? " • " : ""}
                      {t.location || ""}
                    </p>
                  )}

                  {t.description && (
                    <p className="text-xs text-gray-400 mt-1 ml-10 line-clamp-1">
                      {t.description}
                    </p>
                  )}

                  {t.image_url && (
                    <div className="mt-2 ml-10">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                        <img
                          src={t.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenancePage;
