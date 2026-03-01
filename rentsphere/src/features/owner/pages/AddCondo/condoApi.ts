/**
 * Shared API helpers for the AddCondo wizard steps.
 * All calls go to /api/v1/condos/:condoId/... with JWT auth.
 */

const API = import.meta.env.VITE_API_URL || "https://backendlinefacality.onrender.com";

function getAuth() {
    // Import inline to avoid circular deps
    const raw = localStorage.getItem("rentsphere_auth");
    if (!raw) return { token: "" };
    try {
        const parsed = JSON.parse(raw);
        return { token: parsed?.state?.token || "" };
    } catch {
        return { token: "" };
    }
}

function getCondoId(): string {
    const raw = localStorage.getItem("rentsphere_condo_wizard");
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        return parsed?.state?.condoId || "";
    } catch {
        return "";
    }
}

function headers(extra?: Record<string, string>) {
    const { token } = getAuth();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
    };
}

async function handleRes<T>(res: Response): Promise<T> {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.error || "API Error");
    return data as T;
}

/* ========== Step 1: Services ========== */
export async function addService(payload: {
    name: string;
    price: number;
    isVariable: boolean;
    variableType: string;
}) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/services`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
    });
    return handleRes<{ ok: boolean; service: any }>(res);
}

/* ========== Step 2: Utilities ========== */
export async function saveUtilities(payload: {
    water?: { billingType: string; rate: number } | null;
    electricity?: { billingType: string; rate: number } | null;
}) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/utilities`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(payload),
    });
    return handleRes<{ ok: boolean }>(res);
}

/* ========== Step 3: Bank Accounts ========== */
export async function addBankAccount(payload: {
    bank: string;
    accountName: string;
    accountNo: string;
}) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/bank-accounts`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
    });
    return handleRes<{ ok: boolean; account: any }>(res);
}

export async function updatePaymentNote(paymentNote: string) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ paymentNote }),
    });
    return handleRes<{ ok: boolean }>(res);
}

/* ========== Step 4-5: Floors & Rooms ========== */
export async function createFloors(payload: {
    floorCount: number;
    roomsPerFloor: number[];
}) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/floors`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
    });
    return handleRes<{ ok: boolean; totalRooms: number }>(res);
}

export async function getRooms() {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/rooms`, {
        method: "GET",
        headers: headers(),
    });
    return handleRes<{ ok: boolean; rooms: any[] }>(res);
}

/* ========== Step 6: Room Prices ========== */
export async function setRoomPrices(rooms: { roomId: string; price: number }[]) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/rooms/price`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ rooms }),
    });
    return handleRes<{ ok: boolean }>(res);
}

/* ========== Step 7: Room Status ========== */
export async function setRoomStatuses(rooms: { roomId: string; status: string }[]) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/rooms/status`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ rooms }),
    });
    return handleRes<{ ok: boolean }>(res);
}

/* ========== Step 8: Room Services ========== */
export async function setRoomServices(rooms: { roomId: string; serviceId: string | null }[]) {
    const condoId = getCondoId();
    const res = await fetch(`${API}/api/v1/condos/${condoId}/rooms/service`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ rooms }),
    });
    return handleRes<{ ok: boolean }>(res);
}

/* ========== Get Condo info ========== */
export async function getMyCondo() {
    const res = await fetch(`${API}/api/v1/condos/mine`, {
        method: "GET",
        headers: headers(),
    });
    return handleRes<{ ok: boolean; condo: any }>(res);
}
