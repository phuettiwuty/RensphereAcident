import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Check, Clock, Box, RefreshCw } from "lucide-react";

const API = "https://backendlinefacality.onrender.com";

// --- Types ---
type ParcelStatus = "sent" | "received" | "pending";

interface ParcelDTO {
  id: string;
  dormUserId: string;
  tenantName: string;
  room: string | null;
  note: string | null;
  imageUrl: string | null;
  createdAt: string;
  status: string;
}

interface Parcel {
  id: string;
  parcelCode: string;
  receivedDate: string;
  receiverName: string;
  room: string;
  dropOffLocation: string;
  staffName: string;
  status: ParcelStatus;
  imageUrl: string;
  note?: string;
}

function mapDtoToParcel(dto: ParcelDTO, idx: number): Parcel {
  const d = new Date(dto.createdAt);
  const dateStr = d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let status: ParcelStatus = "pending";
  if (dto.status === "received") status = "received";
  else if (dto.status === "sent") status = "pending"; // admin ส่งแล้ว แต่ยังไม่กดรับ

  return {
    id: dto.id,
    parcelCode: `#P-${String(1000 + idx).slice(-4)}`,
    receivedDate: dateStr,
    receiverName: dto.tenantName || "-",
    room: dto.room || "-",
    dropOffLocation: "สำนักงานนิติบุคคล",
    staffName: "เจ้าหน้าที่อาคาร",
    status,
    imageUrl:
      dto.imageUrl ||
      "https://cdn-icons-png.flaticon.com/512/685/685388.png",
    note: dto.note || undefined,
  };
}

// --- Components ---
const StatusBadge: React.FC<{ status: ParcelStatus }> = ({ status }) => {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-xs font-bold">
        <Clock size={12} />
        รอรับพัสดุ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold">
      <div className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center">
        <Check size={8} className="text-white" strokeWidth={4} />
      </div>
      รับแล้ว
    </span>
  );
};

const ParcelPage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "detail" | "success">("list");
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);

  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // โหลดพัสดุจาก backend
  const loadParcels = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const lineUserId = localStorage.getItem("lineUserId");
      if (!lineUserId) {
        navigate("/role", { replace: true });
        return;
      }

      // 1. ดึง dormUserId ของ user จาก /dorm/status
      const statusRes = await fetch(
        `${API}/dorm/status?lineUserId=${encodeURIComponent(lineUserId)}`
      );
      const statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusData?.error || "โหลดข้อมูลผู้ใช้ไม่สำเร็จ");

      const dormUserId = statusData?.dormUser?.id;
      if (!dormUserId) {
        // ยังไม่ผูกโค้ดหอ
        navigate("/tenant/dorm-register", { replace: true });
        return;
      }

      // 2. ดึงประวัติพัสดุทั้งหมด
      const parcelRes = await fetch(`${API}/admin/parcel/history`);
      const parcelData = await parcelRes.json().catch(() => ({}));
      if (!parcelRes.ok) throw new Error(parcelData?.error || "โหลดข้อมูลพัสดุไม่สำเร็จ");

      // 3. กรองเฉพาะพัสดุของ user นี้
      const allItems: ParcelDTO[] = parcelData.items || [];
      const myItems = allItems.filter((p) => p.dormUserId === dormUserId);

      // 4. แปลงเป็น Parcel[]
      const mapped = myItems.map((dto, i) => mapDtoToParcel(dto, i));
      setParcels(mapped);
    } catch (e: any) {
      setErr(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadParcels();
  }, [loadParcels]);

  const pendingCount = parcels.filter((p) => p.status === "pending").length;

  const handleParcelClick = (parcel: Parcel) => {
    setSelectedParcel(parcel);
    setView("detail");
  };

  const handleConfirmReceive = () => {
    setView("success");
  };

  const handleBack = () => {
    if (view === "detail" || view === "success") {
      setView("list");
      setSelectedParcel(null);
    } else {
      navigate(-1);
    }
  };

  // ======================== LIST VIEW ========================
  const renderList = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (err) {
      return (
        <div className="bg-white rounded-3xl p-6 shadow border border-gray-100">
          <div className="text-red-600 font-bold mb-3">{err}</div>
          <button
            onClick={loadParcels}
            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl"
          >
            ลองใหม่
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <div className="relative overflow-hidden rounded-2xl bg-[#EAF2FF] p-5 border border-blue-100">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                <Box size={32} className="text-blue-500" />
              </div>
              {pendingCount > 0 && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#93C5FD] rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow">
                  {pendingCount}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-extrabold text-gray-900">
                {pendingCount > 0
                  ? `คุณมีพัสดุ ${pendingCount} ชิ้นรอรับ`
                  : "ไม่มีพัสดุรอรับ"}
              </h2>
              <p className="text-sm text-gray-500 font-medium">
                ทั้งหมด {parcels.length} รายการ
              </p>
            </div>
            <button
              onClick={loadParcels}
              className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-90 transition"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Empty State */}
        {parcels.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-400 mb-4">
              <Box size={40} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">
              ยังไม่มีพัสดุ
            </h2>
            <p className="text-gray-400 font-medium text-sm">
              เมื่อมีพัสดุถึงจะแสดงที่นี่
            </p>
          </div>
        )}

        {/* List Items */}
        <div className="space-y-3 pb-20">
          {parcels.map((parcel) => (
            <div
              key={parcel.id}
              onClick={() => handleParcelClick(parcel)}
              className="flex items-center p-3 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer"
            >
              <div className="w-20 h-20 bg-[#f8f9fc] rounded-xl overflow-hidden flex-shrink-0">
                <img
                  src={parcel.imageUrl}
                  alt={parcel.parcelCode}
                  className="w-full h-full object-cover rounded-xl"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://cdn-icons-png.flaticon.com/512/685/685388.png";
                  }}
                />
              </div>

              <div className="flex-1 ml-4 min-w-0">
                <h3 className="text-base font-bold text-gray-900 mb-0.5">
                  พัสดุ {parcel.parcelCode}
                </h3>
                <p className="text-xs text-gray-400 mb-2">
                  ได้รับเมื่อ: {parcel.receivedDate}
                </p>
                <StatusBadge status={parcel.status} />
              </div>

              <div className="ml-2 text-gray-300">
                <ChevronRight size={20} strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ======================== DETAIL VIEW ========================
  const renderDetail = () => {
    if (!selectedParcel) return null;
    return (
      <div className="space-y-5 pb-8">
        {/* Image */}
        <div className="w-full h-56 bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 relative">
          <img
            src={selectedParcel.imageUrl}
            alt={selectedParcel.parcelCode}
            className="w-full h-full object-contain p-4"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://cdn-icons-png.flaticon.com/512/685/685388.png";
            }}
          />
        </div>

        {/* Info Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-extrabold text-gray-900">ข้อมูลพัสดุ</h2>

          <div className="space-y-3 text-sm">
            <div className="flex">
              <span className="w-28 text-gray-400 font-medium flex-shrink-0">รหัสพัสดุ:</span>
              <span className="text-gray-900 font-bold">{selectedParcel.parcelCode}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-gray-400 font-medium flex-shrink-0">ได้รับเมื่อ:</span>
              <span className="text-gray-900 font-bold">{selectedParcel.receivedDate}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-gray-400 font-medium flex-shrink-0">ผู้รับ:</span>
              <span className="text-gray-900 font-bold">{selectedParcel.receiverName}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-gray-400 font-medium flex-shrink-0">ห้อง:</span>
              <span className="text-gray-900 font-bold">{selectedParcel.room}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-gray-400 font-medium flex-shrink-0">สถานะ:</span>
              <StatusBadge status={selectedParcel.status} />
            </div>
          </div>
        </div>

        {/* Note Card */}
        {selectedParcel.note && (
          <div className="bg-[#EAF2FF] rounded-3xl p-6 border border-blue-100">
            <h3 className="text-sm font-extrabold text-gray-900 mb-2">
              หมายเหตุจากเจ้าหน้าที่
            </h3>
            <p className="text-sm text-gray-600 font-medium leading-relaxed whitespace-pre-line">
              {selectedParcel.note}
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="px-2">
          <div className="flex items-start gap-3 pb-6 relative">
            <div className="flex flex-col items-center">
              <div className="w-5 h-5 rounded-full bg-[#93C5FD] flex items-center justify-center border-2 border-white shadow">
                <Check size={10} className="text-white" strokeWidth={4} />
              </div>
              <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
            </div>
            <p className="text-sm font-bold text-gray-600 pt-0.5">
              พัสดุเข้าระบบ: {selectedParcel.receivedDate}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              {selectedParcel.status === "pending" ? (
                <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center border-2 border-white shadow ring-2 ring-yellow-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#93C5FD] flex items-center justify-center border-2 border-white shadow">
                  <Check size={10} className="text-white" strokeWidth={4} />
                </div>
              )}
            </div>
            <div className="pt-0.5">
              <StatusBadge status={selectedParcel.status} />
            </div>
          </div>
        </div>

        {/* Confirm Button */}
        {selectedParcel.status === "pending" && (
          <div className="flex justify-center pt-2 pb-8">
            <button
              onClick={handleConfirmReceive}
              className="w-full max-w-xs h-12 bg-[#93C5FD] hover:bg-[#7bb5fc] text-white rounded-full font-bold shadow-lg shadow-blue-200 active:scale-[0.98] transition"
            >
              ยืนยันการรับพัสดุ
            </button>
          </div>
        )}
      </div>
    );
  };

  // ======================== SUCCESS VIEW ========================
  const renderSuccess = () => {
    if (!selectedParcel) return null;
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center space-y-8">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-[#93C5FD] flex items-center justify-center shadow-lg shadow-blue-200">
            <Check size={56} className="text-white" strokeWidth={4} />
          </div>
          <div className="absolute inset-0 bg-[#93C5FD] rounded-full blur-xl opacity-30 animate-pulse" />
        </div>

        <h2 className="text-2xl font-extrabold text-gray-900">
          รับพัสดุเรียบร้อย
        </h2>

        <div className="w-full bg-white rounded-3xl p-4 shadow-md border border-gray-100">
          <div className="w-full h-40 bg-[#f8f9fc] rounded-2xl overflow-hidden mb-4">
            <img
              src={selectedParcel.imageUrl}
              alt={selectedParcel.parcelCode}
              className="w-full h-full object-contain p-4"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://cdn-icons-png.flaticon.com/512/685/685388.png";
              }}
            />
          </div>
          <div className="text-left px-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              พัสดุ {selectedParcel.parcelCode}
            </h3>
            <p className="text-sm text-gray-400 mb-3">
              ได้รับเมื่อ: {selectedParcel.receivedDate}
            </p>
            <StatusBadge status="received" />
          </div>
        </div>

        <button
          onClick={() => {
            setView("list");
            setSelectedParcel(null);
            loadParcels(); // refresh
          }}
          className="w-full max-w-xs h-12 bg-[#93C5FD] hover:bg-[#7bb5fc] text-white rounded-full font-bold shadow-lg shadow-blue-200 active:scale-[0.98] transition"
        >
          กลับหน้าหลัก
        </button>
      </div>
    );
  };

  // ======================== MAIN RENDER ========================
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white px-6 pt-4 pb-3 flex items-center justify-between border-b border-gray-50">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-50 active:scale-90 transition text-gray-700"
        >
          <ChevronLeft size={26} strokeWidth={2.5} />
        </button>

        <h1 className="text-lg font-extrabold text-gray-900">พัสดุ</h1>

        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="px-5 pt-4">
        {view === "list" && renderList()}
        {view === "detail" && renderDetail()}
        {view === "success" && renderSuccess()}
      </div>
    </div>
  );
};

export default ParcelPage;
