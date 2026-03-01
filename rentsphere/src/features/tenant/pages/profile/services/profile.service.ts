import type { UserProfile } from '../types/profile.type';

const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function getLineUserId(): string {
  return localStorage.getItem("lineUserId") || "";
}

export const getProfileData = async (): Promise<UserProfile> => {
  const lineUserId = getLineUserId();
  if (!lineUserId) throw new Error("ไม่พบ lineUserId");

  const r = await fetch(`${API}/dorm/status?lineUserId=${encodeURIComponent(lineUserId)}`);
  const data = await r.json().catch(() => ({}));

  if (!r.ok || !data.linked) {
    throw new Error("ไม่พบข้อมูลผู้เช่า");
  }

  const du = data.dormUser || {};

  // หาชื่อคอนโดจาก rooms → condo
  let condoName = "";
  try {
    // ใช้ code ของ dorm_user หา room → condo
    if (du.code) {
      const rr = await fetch(`${API}/api/v1/tenant/link-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: du.code, lineUserId }),
      });
      const rd = await rr.json().catch(() => ({}));
      if (rd.condoName) condoName = rd.condoName;
    }
  } catch { /* ignore */ }

  return {
    name: du.full_name || "ผู้เช่า",
    unit: du.room ? `ห้อง ${du.room}` : "—",
    condo: condoName || "—",
    email: du.email || "—",
    phone: du.phone || "—",
  };
};

export const updateProfileData = async (data: Partial<UserProfile>): Promise<boolean> => {
  const lineUserId = getLineUserId();
  if (!lineUserId) throw new Error("ไม่พบ lineUserId");

  const r = await fetch(`${API}/tenant/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-line-user-id": lineUserId,
    },
    body: JSON.stringify({
      full_name: data.name || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
    }),
  });

  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(result?.error || "อัพเดตไม่สำเร็จ");
  return true;
};
