import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CondoInfoSection from "../components/CondoInfoSection";
import OtherDetailsSection from "../components/OtherDetailsSection";
import PaymentSection from "../components/PaymentSection";
import { useAuthStore } from "@/features/auth/auth.store";
import { useCondoWizardStore } from "../condoWizard.store";

interface FormData {
  logoFile: File | null;
  nameTh: string;
  addressTh: string;
  nameEn: string;
  addressEn: string;
  phoneNumber: string;
  taxId: string;
  paymentDueDate: string; //YYYY-MM-DD
  fineAmount: string;
  acceptFine: boolean;
}

/* =========================
   Backend DTO
   ========================= */
type CreateCondoPayload = {
  nameTh: string;
  addressTh: string;
  nameEn?: string;
  addressEn?: string;
  phoneNumber?: string;
  taxId?: string;
  paymentDueDate?: string; //YYYY-MM-DD
  acceptFine: boolean;
  fineAmount?: number;
};

/* =========================
   Helpers
   ========================= */
const normalizeMoney = (v: string) => {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function buildCreateCondoFormData(form: FormData) {
  const payload: CreateCondoPayload = {
    nameTh: form.nameTh.trim(),
    addressTh: form.addressTh.trim(),
    nameEn: form.nameEn.trim() || undefined,
    addressEn: form.addressEn.trim() || undefined,
    phoneNumber: form.phoneNumber.trim() || undefined,
    taxId: form.taxId.trim() || undefined,
    paymentDueDate: form.paymentDueDate || undefined,
    acceptFine: Boolean(form.acceptFine),
    fineAmount: form.acceptFine ? normalizeMoney(form.fineAmount) : undefined,
  };

  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  if (form.logoFile) fd.append("logo", form.logoFile);
  return fd;
}

/* ===== Backend call  ===== */
async function createCondo(form: FormData, token: string): Promise<{ condoId: string }> {
  const res = await fetch(`${API}/api/v1/condos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: buildCreateCondoFormData(form),
  });

  if (!res.ok) {
    let msg = "สร้างคอนโดไม่สำเร็จ";
    try {
      const data = await res.json();
      msg = data?.error || data?.message || msg;
    } catch { }
    throw new Error(msg);
  }

  const data = await res.json();
  return { condoId: String(data.condoId ?? data.id ?? "") };
}

function CardShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)] border border-blue-100/60 overflow-hidden">
      <div className="flex items-center justify-between px-8 py-5 bg-[#f3f7ff] border-b border-blue-100/60">
        <div className="flex items-center gap-3">
          <div className="h-9 w-1.5 rounded-full bg-[#5b86ff]" />
          <div>
            <div className="text-xl font-extrabold text-gray-900">{title}</div>
            {hint && <div className="mt-1 text-sm font-bold text-gray-600">{hint}</div>}
          </div>
        </div>
      </div>

      <div className="px-8 py-7">{children}</div>
    </div>
  );
}

export default function Step_0() {
  const nav = useNavigate();

  const [formData, setFormData] = useState<FormData>({
    logoFile: null,
    nameTh: "",
    addressTh: "",
    nameEn: "",
    addressEn: "",
    phoneNumber: "",
    taxId: "",
    paymentDueDate: "",
    fineAmount: "",
    acceptFine: false,
  });

  const condoId = useCondoWizardStore((s) => s.condoId);
  const setCondoId = useCondoWizardStore((s) => s.setCondoId);

  // ✅ Auto-detect: ถ้ายังไม่มี condoId แต่ user มีคอนโดอยู่ใน DB → set condoId อัตโนมัติ
  useEffect(() => {
    if (condoId) return; // มี condoId แล้ว ไม่ต้องทำ
    let cancelled = false;
    (async () => {
      try {
        // อ่าน token จาก localStorage โดยตรง (เพราะ Zustand auth store อาจยัง hydrate ไม่เสร็จ)
        let token = "";
        try {
          const raw = localStorage.getItem("rentsphere_auth");
          if (raw) {
            const parsed = JSON.parse(raw);
            token = parsed?.state?.token || "";
          }
        } catch { }
        console.log("[Step0] Auto-detect: token =", token ? "YES" : "NO");
        if (!token) return;

        const res = await fetch(`${API}/api/v1/condos/mine`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        console.log("[Step0] Auto-detect: /condos/mine status =", res.status);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        console.log("[Step0] Auto-detect: response data =", data);
        // หา condo ที่ user เป็นเจ้าของ
        let condo: any = null;
        if (data.condo) condo = data.condo;
        else if (Array.isArray(data.condos) && data.condos.length > 0) condo = data.condos[0];

        if (condo && condo.id && !cancelled) {
          console.log("[Step0] Auto-detected condo:", condo.id);
          setCondoId(condo.id);
        } else {
          console.log("[Step0] No condo found in response");
        }
      } catch (e) {
        console.error("[Step0] auto-detect condo error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [condoId, setCondoId]);

  // ✅ โหลดข้อมูลเดิมจาก DB เมื่อมี condoId (กดย้อนกลับ / refresh)
  useEffect(() => {
    if (!condoId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCondoDetail } = await import("../condoApi");
        const data = await getCondoDetail();
        if (cancelled || !data.condo) return;
        const c = data.condo;
        setFormData((prev) => ({
          ...prev,
          nameTh: c.name_th || "",
          addressTh: c.address_th || "",
          nameEn: c.name_en || "",
          addressEn: c.address_en || "",
          phoneNumber: c.phone_number || "",
          taxId: c.tax_id || "",
          paymentDueDate: c.payment_due_date ? String(c.payment_due_date) : "",
          fineAmount: c.fine_amount ? String(c.fine_amount) : "",
          acceptFine: !!c.accept_fine,
        }));
      } catch (e) {
        console.error("load condo detail error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [condoId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (!name) return;

    if (type === "checkbox") {
      const { checked } = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (file: File | null) => {
    setFormData((prev) => ({ ...prev, logoFile: file }));
  };

  const canCreate = useMemo(() => {
    const hasBasic = formData.nameTh.trim().length > 0 && formData.addressTh.trim().length > 0;
    if (!hasBasic) return false;

    if (formData.acceptFine) {
      const fine = normalizeMoney(formData.fineAmount);
      if (fine == null) return false;
    }

    return true;
  }, [formData]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // ถ้ามี condoId แล้ว = กลับมาแก้ไข => ไม่ต้อง create ใหม่
    if (condoId) {
      nav("/owner/add-condo/step-1");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const token = useAuthStore.getState().token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบก่อน");

      const { condoId: newCondoId } = await createCondo(formData, token);

      useCondoWizardStore.getState().setCondoId(newCondoId);
      nav("/owner/add-condo/step-1");
    } catch (e: any) {
      setSubmitError(e?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[1120px] mx-auto flex flex-col gap-[18px] pb-[110px]">
      <h1 className="text-center text-[34px] font-extrabold text-black/85 tracking-[0.2px] mb-[6px] mt-[6px]">
        ตั้งค่าคอนโดมิเนียม
      </h1>

      <div className="rounded-2xl bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)] border border-blue-100/60 overflow-hidden">
        <div className="flex items-center gap-3 px-8 py-5 bg-[#f3f7ff] border-b border-blue-100/60">
          <div className="h-9 w-1.5 rounded-full bg-[#5b86ff]" />
          <div>
            <div className="text-xl font-extrabold text-gray-900 tracking-tight">ข้อมูลพื้นฐาน</div>
            <div className="mt-1 text-sm font-bold text-gray-600">
              กรอกชื่อ/ที่อยู่คอนโด (TH/EN), ข้อมูลติดต่อ และกำหนดการชำระเงิน
            </div>
          </div>
        </div>

        <div className="px-8 py-7">
          <ul className="list-disc pl-6 text-base text-gray-700 space-y-2 font-bold">
            <li>กรอกชื่อ/ที่อยู่คอนโด (TH/EN)</li>
            <li>ข้อมูลติดต่อ + เลขผู้เสียภาษี</li>
            <li>ตั้งวันครบกำหนดชำระและค่าปรับ (ถ้ามี)</li>
          </ul>
        </div>
      </div>

      <CardShell title="ข้อมูลคอนโด" hint="ชื่อ, ที่อยู่, โลโก้ และข้อมูลติดต่อ">
        <CondoInfoSection
          formData={formData}
          handleChange={handleChange}
          handleFileChange={handleFileChange}
        />
      </CardShell>

      <CardShell title="รายละเอียดอื่น ๆ" hint="ข้อมูลเพิ่มเติมสำหรับเอกสาร/การติดต่อ">
        <OtherDetailsSection formData={formData} handleChange={handleChange} />
      </CardShell>

      <CardShell title="การชำระเงิน" hint="กำหนดวันครบกำหนดและค่าปรับ (ถ้ามี)">
        <PaymentSection formData={formData} handleChange={handleChange} />
      </CardShell>

      {submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-700 font-extrabold">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end gap-[14px] flex-wrap pt-4">
        {condoId && (
          <button
            type="button"
            onClick={() => nav("/owner/add-condo/step-1")}
            className="h-[46px] w-24 rounded-xl border-0 text-white font-black text-sm shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition
             bg-[#93C5FD] hover:bg-[#7fb4fb] active:scale-[0.98] cursor-pointer
             focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            ต่อไป
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canCreate || submitting}
          className={[
            "h-[46px] px-5 rounded-xl border-0 text-white font-black text-sm shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition",
            "!bg-[#93C5FD] hover:!bg-[#7fb4fb] active:scale-[0.98] cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-blue-300",
            "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100",
          ].join(" ")}
        >
          {submitting ? "กำลังสร้าง..." : condoId ? "บันทึก" : "สร้าง"}
        </button>
      </div>
    </div>
  );
}