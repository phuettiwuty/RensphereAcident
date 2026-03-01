// facility.service.ts
import type { CreateFacilityPayload } from "../CreateFacilityModal";

const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export const facilityService = {
  /** โหลด facilities ของ condo ที่เลือก */
  async getFacilities(condoId: string, token: string) {
    const r = await fetch(`${API}/api/v1/condos/${condoId}/facilities`, {
      headers: authHeaders(token),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");

    return (data.items || []).map((x: any) => ({
      id: x.id,
      name: x.name,
      description: x.description ?? "",
      capacity: x.capacity,
      openTime: x.open_time,
      closeTime: x.close_time,
      slotMinutes: x.slot_minutes,
      isAutoApprove: x.is_auto_approve ?? x.isAutoApprove ?? false,
      active: x.active ?? true,
      type: x.type,
    }));
  },

  /** สร้าง facility ใหม่ภายใต้ condo */
  async createFacility(condoId: string, token: string, payload: CreateFacilityPayload) {
    const body = {
      name: payload.name,
      type: payload.type,
      capacity: payload.capacity,
      open_time: payload.openTime,
      close_time: payload.closeTime,
      slot_minutes: payload.slotMinutes,
      is_auto_approve: payload.isAutoApprove,
      description: payload.description ?? null,
      active: payload.active ?? true,
    };

    const r = await fetch(`${API}/api/v1/condos/${condoId}/facilities`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "สร้างพื้นที่ไม่สำเร็จ");
    return data;
  },
};
