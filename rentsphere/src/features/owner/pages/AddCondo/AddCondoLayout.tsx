import RentSphereLogo from "@/assets/brand/rentsphere-logo.png";
import { useEffect, useState } from "react";
import { Outlet, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useCondoWizardStore } from "./condoWizard.store";

const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

const MENU = [
    { label: "ค่าบริการ", path: "step-1" },
    { label: "การคิดค่าน้ำ / ค่าไฟ", path: "step-2" },
    { label: "บัญชีธนาคาร", path: "step-3" },
    { label: "จัดการชั้น", path: "step-4" },
    { label: "ผังห้อง", path: "step-5" },
    { label: "ค่าห้อง", path: "step-6" },
    { label: "สถานะห้อง", path: "step-7" },
    { label: "ค่าบริการรายห้อง", path: "step-8" },
];

function SidebarItem({
    label,
    isActive,
    onClick,
}: {
    label: string;
    isActive?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "w-full text-left rounded-2xl",
                "px-7 py-5",
                "text-[18px] font-extrabold text-black/80",
                "tracking-[0.2px]",
                "transition-all duration-200",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/40",
                isActive
                    ? "bg-white shadow-md translate-x-0.5"
                    : "text-gray-700 hover:bg-white/60 hover:text-gray-900 hover:translate-x-0.5",
            ].join(" ")}
        >
            {label}
        </button>
    );
}

/* ===== Types ===== */
type MeResponse = {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
};

/* ===== Backend call  ===== */
async function fetchMe(): Promise<MeResponse> {
    // TODO: GET /api/me หรือ /api/owner/me
    const res = await fetch("/api/me", {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
    const data = await res.json();

    return {
        id: String(data.id ?? ""),
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        displayName: data.displayName ?? data.name ?? null,
    };
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    const a = parts[0]?.[0] ?? "U";
    const b = parts.length >= 2 ? parts[parts.length - 1]?.[0] ?? "" : "";
    return (a + b).toUpperCase();
}

function buildDisplayName(me: MeResponse | null) {
    if (!me) return "";
    const dn = (me.displayName ?? "").trim();
    if (dn) return dn;

    const fn = (me.firstName ?? "").trim();
    const ln = (me.lastName ?? "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || "";
}

export default function AddCondoLayout() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const condoId = useCondoWizardStore((s) => s.condoId);
    const setCondoId = useCondoWizardStore((s) => s.setCondoId);
    const wizardMode = useCondoWizardStore((s) => s.wizardMode);
    const maxUnlockedStep = useCondoWizardStore((s) => s.maxUnlockedStep);

    // ✅ Auto-detect condoId: ถ้ายังไม่มี condoId → ดึงจาก /api/v1/condos/mine อัตโนมัติ
    useEffect(() => {
        if (condoId) return;
        let cancelled = false;
        (async () => {
            try {
                let token = "";
                try {
                    const raw = localStorage.getItem("rentsphere_auth");
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        token = parsed?.state?.token || "";
                    }
                } catch { }
                console.log("[AddCondoLayout] Auto-detect: token =", token ? "YES" : "NO");
                if (!token) return;

                const res = await fetch(`${API}/api/v1/condos/mine`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                });
                console.log("[AddCondoLayout] /condos/mine status =", res.status);
                if (!res.ok || cancelled) return;
                const data = await res.json();
                let condo: any = null;
                if (data.condo) condo = data.condo;
                else if (Array.isArray(data.condos) && data.condos.length > 0) condo = data.condos[0];

                if (condo?.id && !cancelled) {
                    console.log("[AddCondoLayout] Auto-detected condoId:", condo.id);
                    setCondoId(condo.id);
                }
            } catch (e) {
                console.error("[AddCondoLayout] auto-detect error:", e);
            }
        })();
        return () => { cancelled = true; };
    }, [condoId, setCondoId]);

    const isActive = (stepPath: string) =>
        !!matchPath({ path: `/owner/add-condo/${stepPath}` }, pathname);

    const isStep0 = !!matchPath({ path: "/owner/add-condo/step-0" }, pathname);
    const isStep9 = !!matchPath({ path: "/owner/add-condo/step-9" }, pathname);
    const currentStep = (() => {
        const m = pathname.match(/\/owner\/add-condo\/step-(\d+)$/);
        return m ? Number(m[1]) : null;
    })();

    useEffect(() => {
        if (wizardMode === "edit") return;
        if (currentStep == null || Number.isNaN(currentStep)) return;
        if (currentStep === 0) return;

        if (maxUnlockedStep <= 0) {
            navigate("/owner/add-condo/step-0", { replace: true });
            return;
        }

        if (currentStep !== maxUnlockedStep) {
            navigate(`/owner/add-condo/step-${maxUnlockedStep}`, { replace: true });
        }
    }, [wizardMode, currentStep, maxUnlockedStep, navigate]);

    /* ===== load owner name from auth store ===== */
    const [me, setMe] = useState<MeResponse | null>(null);
    const [meLoading, setMeLoading] = useState(false);

    useEffect(() => {
        if (isStep0 || isStep9) return;
        if (me) return;
        setMeLoading(true);
        try {
            const raw = localStorage.getItem("rentsphere_auth");
            if (raw) {
                const parsed = JSON.parse(raw);
                const user = parsed?.state?.user;
                if (user) {
                    setMe({
                        id: user.id || "",
                        displayName: user.name || user.email || "Owner",
                    });
                }
            }
        } catch { }
        setMeLoading(false);
    }, [pathname, isStep0, isStep9]);

    if (isStep0) {
        return (
            <div className="owner-ui min-h-screen w-full bg-[#EEF4FF] font-sans text-black/85">
                <Outlet />
            </div>
        );
    }

    if (isStep9) {
        return (
            <div className="owner-ui min-h-screen w-full bg-[#EEF4FF] font-sans text-black/85 flex items-center justify-center p-6">
                <div className="w-full">
                    <Outlet />
                </div>
            </div>
        );
    }

    const ownerName = buildDisplayName(me) || "Owner";
    const initials = getInitials(ownerName);

    return (
        <div className="owner-ui flex h-screen w-full overflow-hidden bg-[#EEF4FF] font-sans text-black/85">
            <aside className="w-[22rem] shrink-0 bg-[#D6E6FF] border-r border-blue-100/80 shadow-[2px_0_14px_rgba(0,0,0,0.05)] flex flex-col h-screen overflow-hidden">
                <div className="shrink-0 px-8 pt-7 pb-5">
                    {wizardMode === "edit" ? (
                        <button
                            type="button"
                            onClick={() => navigate("/owner/condo")}
                            className="flex items-start gap-4 text-left group focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/40 rounded-2xl"
                            aria-label="Go to owner condo page"
                        >
                            <div className="h-24 w-24 shrink-0 overflow-hidden -mt-2">
                                <img
                                    src={RentSphereLogo}
                                    alt="RentSphere"
                                    draggable={false}
                                    className="h-full w-full object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.22)] scale-[1.18] -translate-y-[12px]"
                                />
                            </div>

                            <span className="text-3xl font-extrabold tracking-tight text-gray-900 leading-none pt-[6px] group-hover:text-blue-700 transition-colors">
                                RentSphere
                            </span>
                        </button>
                    ) : (
                        <div className="flex items-start gap-4">
                            <div className="h-24 w-24 shrink-0 overflow-hidden -mt-2">
                                <img
                                    src={RentSphereLogo}
                                    alt="RentSphere"
                                    draggable={false}
                                    className="h-full w-full object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.22)] scale-[1.18] -translate-y-[12px]"
                                />
                            </div>

                            <span className="text-3xl font-extrabold tracking-tight text-gray-900 leading-none pt-[6px]">
                                RentSphere
                            </span>
                        </div>
                    )}

                    <div className="text-3xl font-extrabold tracking-tight text-gray-900 text-center">
                        คอนโดมิเนียม
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-4 pb-8">
                    <div className="rounded-3xl border-2 border-dashed border-blue-300/70 bg-white/35 backdrop-blur-sm p-5">
                        <div className="flex flex-col gap-4">
                            {MENU.map((m) => (
                                <SidebarItem
                                    key={m.path}
                                    label={m.label}
                                    isActive={isActive(m.path)}
                                    onClick={
                                        wizardMode === "edit"
                                            ? () => navigate(`/owner/add-condo/${m.path}`)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    </div>

                    <div className="h-10" />
                </div>
            </aside>

            <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
                <header className="h-20 shrink-0 bg-[#D6E6FF] border-b border-blue-100/80 flex items-center justify-end px-10 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-white border border-blue-100 flex items-center justify-center text-blue-700 font-extrabold text-lg shadow-sm">
                            {meLoading ? "…" : initials}
                        </div>

                        <div className="text-gray-900 font-extrabold text-[16px] tracking-[0.2px]">
                            {meLoading ? "กำลังโหลดชื่อ..." : ownerName}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 pb-28">
                    <div className="mx-auto w-full max-w-6xl">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
