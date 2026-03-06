import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, FileText, CheckCircle2, Clock, AlertTriangle, Receipt } from "lucide-react";

const API = "https://backendlinefacality.onrender.com";

type Invoice = {
  id: string;
  totalAmount: number;
  status: string;
  note: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
};

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  PAID: {
    label: "ชำระแล้ว",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    icon: <CheckCircle2 size={18} className="text-emerald-500" />,
  },
  UNPAID: {
    label: "รอชำระ",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    icon: <Clock size={18} className="text-amber-500" />,
  },
  OVERDUE: {
    label: "เลยกำหนด",
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    icon: <AlertTriangle size={18} className="text-red-500" />,
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function formatMonth(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      timeZone: "Asia/Bangkok",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [roomNo, setRoomNo] = useState("");
  const [condoName, setCondoName] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNPAID" | "PAID">("ALL");

  useEffect(() => {
    const lineUserId = localStorage.getItem("lineUserId");
    if (!lineUserId) return;

    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/tenant/invoices`, {
          headers: { "x-line-user-id": lineUserId },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "fetch error");
        setInvoices(data.invoices || []);
        setRoomNo(data.roomNo || "");
        setCondoName(data.condoName || "");
      } catch (e: any) {
        setError(e?.message || "เกิดข้อผิดพลาด");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  const filtered = filter === "ALL"
    ? invoices
    : invoices.filter((inv) => filter === "UNPAID" ? ["UNPAID", "OVERDUE"].includes(inv.status) : inv.status === filter);

  const totalUnpaid = invoices.filter(i => ["UNPAID", "OVERDUE"].includes(i.status)).reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = invoices.filter(i => i.status === "PAID").reduce((s, i) => s + i.totalAmount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-white pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">บิล / การชำระเงิน</h1>
            {roomNo && <p className="text-xs text-gray-400">{condoName} · ห้อง {roomNo}</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="px-6 py-12 text-center text-red-500 font-medium">{error}</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="px-4 pt-4 pb-2 grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Clock size={16} className="text-amber-500" />
                </div>
                <span className="text-xs text-gray-400 font-medium">ค้างชำระ</span>
              </div>
              <p className="text-xl font-bold text-gray-800">฿{totalUnpaid.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
                <span className="text-xs text-gray-400 font-medium">ชำระแล้ว</span>
              </div>
              <p className="text-xl font-bold text-gray-800">฿{totalPaid.toLocaleString()}</p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 flex gap-2">
            {(["ALL", "UNPAID", "PAID"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${filter === f
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                  }`}
              >
                {f === "ALL" ? "ทั้งหมด" : f === "UNPAID" ? "ค้างชำระ" : "ชำระแล้ว"}
                <span className="ml-1 opacity-70">
                  ({f === "ALL" ? invoices.length : filtered.length})
                </span>
              </button>
            ))}
          </div>

          {/* Invoice List */}
          <div className="px-4 pt-2 space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Receipt size={28} className="text-gray-300" />
                </div>
                <p className="text-gray-400 font-medium">ไม่มีรายการ</p>
              </div>
            ) : (
              filtered.map((inv) => {
                const st = statusConfig[inv.status] || statusConfig.UNPAID;
                const isSlipVerified = inv.note?.includes("ตรวจ slip อัตโนมัติ");

                return (
                  <div
                    key={inv.id}
                    className={`bg-white rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md ${inv.status === "PAID" ? "border-emerald-100" : "border-gray-100"
                      }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                          <FileText size={20} className="text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">
                            บิลประจำเดือน {formatMonth(inv.createdAt)}
                          </p>
                          <p className="text-xs text-gray-400">
                            สร้าง: {formatDate(inv.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${st.bg} ${st.color}`}>
                        {st.icon}
                        {st.label}
                      </div>
                    </div>

                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold text-gray-800">
                          ฿{inv.totalAmount.toLocaleString()}
                        </p>
                        {inv.dueDate && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            กำหนดชำระ: {formatDate(inv.dueDate)}
                          </p>
                        )}
                        {inv.paidAt && (
                          <p className="text-xs text-emerald-500 mt-0.5">
                            ชำระเมื่อ: {formatDate(inv.paidAt)}
                          </p>
                        )}
                      </div>
                      {isSlipVerified && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          ✅ Slip Verified
                        </span>
                      )}
                    </div>

                    {inv.note && !isSlipVerified && (
                      <p className="mt-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                        📝 {inv.note}
                      </p>
                    )}

                    {isSlipVerified && inv.note && (
                      <p className="mt-2 text-xs text-blue-500 bg-blue-50/50 rounded-lg p-2">
                        🔍 {inv.note}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BillingPage;
