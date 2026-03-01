import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import rentsphereLogo from "@/assets/brand/rentsphere-logo.png";
import { CondoBackground, Meteors } from "@/features/auth/components/AuthBackground";
import { api } from "@/shared/api/http";
import { useOwnerRegisterStore } from "@/features/auth/ownerRegister.store";

type VerifyEmailRes = { ok: true };

const OwnerVerifyEmailPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const storeRequestId = useOwnerRegisterStore((s) => s.requestId);
  const email = useOwnerRegisterStore((s) => s.email);
  const setRequestId = useOwnerRegisterStore((s) => s.setRequestId);

  const requestIdFromUrl = params.get("requestId");
  const requestId = storeRequestId || requestIdFromUrl || "";

  useEffect(() => {
    if (!storeRequestId && requestIdFromUrl) {
      setRequestId(requestIdFromUrl);
    }
  }, [storeRequestId, requestIdFromUrl, setRequestId]);


  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);

  const isComplete = useMemo(
    () => code.every((d) => d.length === 1),
    [code]
  );


  const onChangeDigit = (i: number, value: string) => {
    const ch = value.replace(/\D/g, "").slice(-1);

    const next = [...code];
    next[i] = ch;
    setCode(next);

    if (ch && i < 5) {
      document.getElementById(`emailcode-${i + 1}`)?.focus();
    }
  };

  const onKeyDownDigit = (
    i: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      document.getElementById(`emailcode-${i - 1}`)?.focus();
    }
  };


  async function handleSubmit() {
    if (!requestId) {
      toast.error("Session หมดอายุ กรุณาสมัครใหม่");
      return;
    }

    if (!isComplete) return;

    try {
      setLoading(true);

      await api<VerifyEmailRes>("/api/v1/auth/verify/email", {
        method: "POST",
        body: JSON.stringify({
          email,
          code: code.join(""),
        }),
      });

      toast.success("ยืนยันอีเมลสำเร็จ 🎉");

      navigate("/auth/owner/register-success", {
        replace: true,
      });
    } catch (e: any) {
      toast.error(e?.message || "รหัสไม่ถูกต้อง");
    } finally {
      setLoading(false);
    }
  }


  async function handleResend() {
    if (!requestId) {
      toast.error("Session หมดอายุ กรุณาสมัครใหม่");
      return;
    }

    try {
      setLoading(true);

      await api<{ ok: true }>("/api/v1/auth/verify/resend", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      toast.success("ส่งรหัสใหม่เรียบร้อย 📩");
    } catch (e: any) {
      toast.error(e?.message || "ส่งรหัสไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="min-h-screen w-full relative overflow-hidden cosmic-gradient flex flex-col items-center justify-center p-6">
      <CondoBackground />
      <Meteors />

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">

        <img
          src={rentsphereLogo}
          alt="RentSphere"
          className="w-28 md:w-32 lg:w-36 mb-3 drop-shadow-xl"
        />

        <h1 className="text-2xl font-bold text-blue-900 tracking-widest mb-12">
          RENTSPHERE
        </h1>

        <div className="w-full flex flex-col items-center">

          <h3 className="text-2xl font-bold text-white mb-6">
            ยืนยันอีเมล
          </h3>

          <p className="text-center text-sm text-white/60 mb-10">
            กรุณากรอกรหัส 6 หลักที่ส่งไปยัง
            <br />
            <span className="font-semibold text-white/80">
              {email || "—"}
            </span>
          </p>

          {/* OTP Input */}
          <div className="flex justify-center gap-4 mb-6">
            {code.map((digit, i) => (
              <input
                key={i}
                id={`emailcode-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="w-14 h-16 md:w-20 md:h-24 text-center text-4xl font-bold rounded-2xl bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                value={digit}
                onChange={(e) => onChangeDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDownDigit(i, e)}
                disabled={loading}
              />
            ))}
          </div>

          {/* Submit */}
          <button
            type="button"
            disabled={!isComplete || loading}
            onClick={handleSubmit}
            className={`w-full max-w-md py-4 btn-auth text-white rounded-2xl font-bold text-lg shadow-lg ${!isComplete || loading
                ? "opacity-50 cursor-not-allowed"
                : ""
              }`}
          >
            {loading ? "กำลังตรวจสอบ..." : "ยืนยันรหัสอีเมล"}
          </button>

          {/* Resend */}
          <button
            type="button"
            disabled={loading}
            onClick={handleResend}
            className="mt-3 text-sm text-white/70 underline"
          >
            ส่งรหัสใหม่
          </button>

          {/* Back */}
          <div className="mt-8 text-center">
            <p className="text-xs text-white/60">
              กลับไปเลือกวิธี?{" "}
              <button
                type="button"
                className="font-bold text-white underline"
                onClick={() =>
                  navigate(
                    `/auth/owner/verify-method?requestId=${encodeURIComponent(
                      requestId
                    )}`
                  )
                }
              >
                กลับไปเลือก
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default OwnerVerifyEmailPage;
