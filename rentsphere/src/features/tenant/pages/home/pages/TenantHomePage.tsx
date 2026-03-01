import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import ResidentCard from "../components/ResidentCard";
import FeatureGrid from "../components/FeatureGrid";
import LatestActivitySection from "../components/LatestActivitySection";

const API = "https://backendlinefacality.onrender.com";

type DormUser = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  registered_at?: string | null;
  line_user_id?: string | null;
  room?: string | null;
};

export default function TenantHomePage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [fullName, setFullName] = useState("Tenant");
  const [condoName, setCondoName] = useState("RentSphere");
  const [unit, setUnit] = useState("");

  useEffect(() => {
    const lineUserId = localStorage.getItem("lineUserId");
    if (!lineUserId) {
      nav("/role", { replace: true });
      return;
    }

    // ดึง condoName จาก cache (dorm/status ไม่ส่ง condoName)
    const tenantRaw = localStorage.getItem("rentsphere_tenant");
    if (tenantRaw) {
      try {
        const cached = JSON.parse(tenantRaw);
        if (cached.condoName) setCondoName(cached.condoName);
      } catch { }
    }

    // โหลดข้อมูลล่าสุดจาก backend ทุกครั้ง
    const run = async () => {
      try {
        setLoading(true);
        setErr("");
        const r = await fetch(`${API}/dorm/status?lineUserId=${encodeURIComponent(lineUserId)}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || "status error");

        if (!data?.linked) {
          nav("/tenant/dorm-register", { replace: true });
          return;
        }

        const dormUser = data.dormUser;
        setFullName(dormUser?.full_name || "ผู้เช่า");
        setUnit(dormUser?.room ? `ห้อง ${dormUser.room}` : "");

        // อัพเดต cache ด้วย
        if (tenantRaw) {
          try {
            const cached = JSON.parse(tenantRaw);
            cached.tenantName = dormUser?.full_name || cached.tenantName;
            localStorage.setItem("rentsphere_tenant", JSON.stringify(cached));
          } catch { }
        }
      } catch (e: any) {
        setErr(e?.message || "เกิดข้อผิดพลาด");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [nav]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Header />

      <ResidentCard
        resident={{
          name: fullName,
          condo: condoName,
          unit: unit || "-",
        }}
      />

      {err ? (
        <div className="px-6 -mt-2 text-red-600 text-sm font-medium">{err}</div>
      ) : null}

      <FeatureGrid />

      <LatestActivitySection
        onSeeAll={() => nav("/tenant/repairs")}
        activities={[
          {
            id: "repair",
            type: "maintenance",
            title: "รายงานซ่อมบำรุง",
            date: "กดเพื่อดูรายการทั้งหมด",
            onClick: () => nav("/tenant/repairs"),
          },
          {
            id: "parcel",
            type: "parcel",
            title: "พัสดุ",
            date: "กำลังปรับปรุง",
            onClick: () => nav("/tenant/parcel"),
          },
        ]}
      />

      <div className="fixed top-0 right-0 -z-10 w-64 h-64 bg-blue-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="fixed bottom-0 left-0 -z-10 w-80 h-80 bg-purple-100/40 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
    </div>
  );
}
