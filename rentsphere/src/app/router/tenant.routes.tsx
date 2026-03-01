import type { RouteObject } from "react-router-dom";
import React from "react";
import { Navigate } from "react-router-dom";

// ✅ ใช้ relative ตัดปัญหา alias @
import TenantLayout from "../../shared/layouts/TenantLayout";

// ✅ Role selection (ต้อง import ไม่งั้น /role จะ 404)
import RoleSelect from "../../features/owner/pages/tenant/RoleSelect";

// ✅ Home
import TenantHomePage from "../../features/tenant/pages/home/pages/TenantHomePage";

// ✅ Booking pages
import FacilityListPage from "../../features/tenant/pages/booking/pages/FacilityListPage";
import FacilityDetailPage from "@/features/tenant/pages/booking/pages/FacilityDetailPage";
import BookingConfirmPage from "@/features/tenant/pages/booking/pages/BookingConfirmPage";
import BookingSuccessPage from "@/features/tenant/pages/booking/pages/BookingSuccessPage";

// ✅ Real pages (ของจริงที่ทำไว้แล้ว)
import ParcelPage from "../../features/tenant/pages/parcel/pages/ParcelPage";
import MaintenancePage from "../../features/tenant/pages/maintenance/pages/MaintenancePage";
import MyRepairs from "@/features/owner/pages/tenant/repairs/MyRepairs";
import RepairDetail from "@/features/owner/pages/tenant/repairs/RepairDetail";
import RepairCreate from "@/features/owner/pages/tenant/repairs/RepairCreate";
import TenantProfilePage from "../../features/tenant/pages/profile/pages/TenantProfilePage";

// ✅ Guard เดิม
function RequireLineLogin({ children }: { children: React.ReactNode }) {
  const lineUserId = localStorage.getItem("lineUserId");
  if (!lineUserId) return <Navigate to="/role" replace />;
  return <>{children}</>;
}

// ✅ placeholder กันพัง (หน้าที่ยังไม่มีของจริง)
const ComingSoon = ({ title }: { title: string }) => (
  <div className="min-h-screen bg-gradient-to-b from-[#f0f7ff] via-[#f0f5ff] to-white pb-32 p-6 pt-10 text-center text-gray-500 font-medium">
    {title} (กำลังปรับปรุง)
  </div>
);

const tenantRoutes: RouteObject[] = [
  // ✅ Role selection (ไม่ต้อง login)
  { path: "/role", element: <RoleSelect /> },

  // รองรับ URL เก่า
  { path: "/tenant/app", element: <Navigate to="/tenant/home" replace /> },

  // shortcut
  { path: "/home", element: <Navigate to="/tenant/home" replace /> },

  {
    path: "/tenant",
    element: (
      <RequireLineLogin>
        <TenantLayout />
      </RequireLineLogin>
    ),
    children: [
      { index: true, element: <Navigate to="home" replace /> },

      // ✅ Home
      { path: "home", element: <TenantHomePage /> },

      // ✅ Booking: เปิดใช้จริง
      { path: "booking", element: <FacilityListPage /> },
      { path: "booking/:id", element: <FacilityDetailPage /> },
      { path: "booking/confirm", element: <BookingConfirmPage /> },
      { path: "booking/success", element: <BookingSuccessPage /> },

      // ✅ Repairs (แจ้งซ่อม)
      { path: "repairs", element: <MyRepairs /> },
      { path: "repairs/:repairId", element: <RepairDetail /> },
      { path: "repair-new", element: <RepairCreate /> },

      // ✅ Parcel (พัสดุ) — ของจริง
      { path: "parcel", element: <ParcelPage /> },

      // ที่เหลือ placeholder กันหน้าอื่นพัง
      { path: "history", element: <ComingSoon title="History" /> },
      { path: "notifications", element: <ComingSoon title="Notifications" /> },
      { path: "profile", element: <TenantProfilePage /> },
      { path: "maintenance", element: <MaintenancePage /> },
      { path: "billing", element: <ComingSoon title="Billing" /> },

      { path: "*", element: <Navigate to="home" replace /> },
    ],
  },
];

export default tenantRoutes;
