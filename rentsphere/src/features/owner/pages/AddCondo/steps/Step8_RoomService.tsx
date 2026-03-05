import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Room } from "../types/addCondo.types";
import { getRooms, setRoomServices, getServices } from "../condoApi";
import { useCondoWizardStore } from "../condoWizard.store";

type ServiceOption = { id: string | number; label: string; price: number };

export default function Step8_RoomService() {
    const nav = useNavigate();
    const condoId = useCondoWizardStore((s) => s.condoId);
    const unlockStep = useCondoWizardStore((s) => s.unlockStep);
    const draftRooms = useCondoWizardStore((s) => s.draftRooms);
    const setDraftRooms = useCondoWizardStore((s) => s.setDraftRooms);

    // ======================
    // Local state (no store)
    // ======================
    const [floorCount, setFloorCount] = useState<number>(0);
    const [roomsPerFloor, setRoomsPerFloor] = useState<number[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);

    // ======================
    // TODO: API (backend will connect later)
    // - GET rooms + floorCount + roomsPerFloor
    // - setFloorCount(...)
    // - setRoomsPerFloor(...)
    // - setRooms(...)
    // ======================
    useEffect(() => {
        if (!condoId) return;
        let cancelled = false;
        async function load() {
            try {
                if (draftRooms.length > 0) {
                    const mapped = draftRooms.map((r) => ({
                        id: r.id,
                        condoId: r.condoId || "",
                        floor: r.floor,
                        roomNo: r.roomNo,
                        price: r.price,
                        serviceId: r.serviceId,
                        isActive: r.isActive,
                        status: r.status,
                    }));
                    const maxFloor = mapped.reduce((m, r) => Math.max(m, r.floor), 0);
                    setFloorCount(maxFloor);
                    setRooms(mapped);

                    const serviceData = await getServices();
                    if (cancelled) return;
                    const opts: ServiceOption[] = (serviceData.services || []).map((s: any) => ({
                        id: s.id,
                        label: s.name || "",
                        price: Number(s.price || 0),
                    }));
                    setServiceOptions(opts);
                    return;
                }

                const [roomData, serviceData] = await Promise.all([getRooms(), getServices()]);
                if (cancelled) return;
                const apiRooms: Room[] = (roomData.rooms || []).map((r: any) => ({
                    id: r.id,
                    condoId: r.condo_id || r.condoId || "",
                    floor: r.floor,
                    roomNo: r.room_no || r.roomNo || "",
                    price: r.price != null ? Number(r.price) : null,
                    serviceId: r.service_id ?? r.serviceId ?? null,
                    isActive: r.is_active ?? r.isActive ?? true,
                    status: r.status || "VACANT",
                }));
                const maxFloor = apiRooms.reduce((m, r) => Math.max(m, r.floor), 0);
                setFloorCount(maxFloor);
                setRooms(apiRooms);
                setDraftRooms(
                    apiRooms.map((r) => ({
                        id: r.id,
                        condoId: r.condoId,
                        floor: r.floor,
                        roomNo: r.roomNo,
                        price: r.price,
                        serviceId: r.serviceId,
                        isActive: r.isActive,
                        status: r.status,
                    }))
                );

                // ✅ โหลดรายการบริการจาก DB
                const opts: ServiceOption[] = (serviceData.services || []).map((s: any) => ({
                    id: s.id,
                    label: s.name || "",
                    price: Number(s.price || 0),
                }));
                setServiceOptions(opts);
            } catch (e) {
                console.error("load rooms/services error:", e);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [condoId, draftRooms, setDraftRooms]);

    // ======================
    // Selection
    // ======================
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedCount = selectedIds.length;

    const roomsByFloor = useMemo(() => {
        const map = new Map<number, Room[]>();
        for (let f = 1; f <= floorCount; f++) map.set(f, []);

        rooms.forEach((r) => {
            if (!r.isActive) return; // แสดงเฉพาะห้องที่เปิดใช้งาน
            map.get(r.floor)?.push(r);
        });

        map.forEach((arr) => arr.sort((a, b) => a.roomNo.localeCompare(b.roomNo)));
        return map;
    }, [rooms, floorCount]);

    const toggleRoom = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const selectAllOnFloor = (floor: number) => {
        const ids = (roomsByFloor.get(floor) ?? []).map((r) => r.id);
        setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    };

    const unselectAllOnFloor = (floor: number) => {
        const ids = new Set((roomsByFloor.get(floor) ?? []).map((r) => r.id));
        setSelectedIds((prev) => prev.filter((id) => !ids.has(id)));
    };

    // ======================
    // Modal
    // ======================
    const [openModal, setOpenModal] = useState(false);
    const [serviceId, setServiceId] = useState<number | "">("");

    const selectedService = useMemo(() => {
        if (serviceId === "") return null;
        return serviceOptions.find((x: ServiceOption) => String(x.id) === String(serviceId)) ?? null;
    }, [serviceId, serviceOptions]);

    const openAssign = () => {
        if (selectedCount === 0) return;
        setServiceId("");
        setOpenModal(true);
    };

    // ======================
    // Local update + TODO API
    // ======================
    const setServiceForRooms = async (roomIds: string[], svcId: number | null) => {
        const ids = new Set(roomIds);
        setRooms((prev) => {
            const next = prev.map((r) => (ids.has(r.id) ? { ...r, serviceId: svcId } : r));
            setDraftRooms(
                next.map((r) => ({
                    id: r.id,
                    condoId: r.condoId,
                    floor: r.floor,
                    roomNo: r.roomNo,
                    price: r.price,
                    serviceId: r.serviceId,
                    isActive: r.isActive,
                    status: r.status,
                }))
            );
            return next;
        });

        try {
            await setRoomServices(roomIds.map((id) => ({ roomId: id, serviceId: svcId ? String(svcId) : null })));
        } catch (e) {
            console.error("set room services error:", e);
        }
    };

    const onSaveService = () => {
        if (!selectedService) return;
        setServiceForRooms(selectedIds, Number(selectedService.id));
        setOpenModal(false);
    };

    const onRemoveService = () => {
        setServiceForRooms(selectedIds, null);
        setOpenModal(false);
    };

    const getService = (id: number | string | null | undefined) => {
        if (!id) return null;
        return serviceOptions.find((x) => String(x.id) === String(id)) ?? null;
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
                        <div className="text-xl font-extrabold text-gray-900 tracking-tight">ค่าบริการรายห้อง</div>
                        <div className="mt-1 text-sm font-bold text-gray-600">
                            เลือกห้อง แล้วกำหนด “ค่าบริการเพิ่มเติม” ให้แต่ละห้อง
                        </div>
                    </div>
                </div>

                <div className="px-8 py-7 space-y-5">
                    {floorCount <= 0 ? (
                        <div className="rounded-2xl border border-blue-100/60 bg-white px-6 py-8 shadow-sm text-center">
                            <div className="text-sm font-extrabold text-gray-900">ยังไม่มีข้อมูลห้อง</div>
                            <div className="mt-1 text-sm font-bold text-gray-600">
                                รอ backend ส่ง floorCount / rooms / roomsPerFloor มาให้ แล้วหน้านี้จะพร้อมใช้งาน
                            </div>
                        </div>
                    ) : (
                        Array.from({ length: floorCount }, (_, i) => i + 1).map((floor) => {
                            const floorRooms = roomsByFloor.get(floor) ?? [];
                            const countHint = roomsPerFloor?.[floor - 1] ?? floorRooms.length;

                            return (
                                <div
                                    key={floor}
                                    className="rounded-2xl border border-blue-100/60 bg-white shadow-sm overflow-hidden"
                                >
                                    <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[#f3f7ff] border-b border-blue-100/60">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-1.5 rounded-full bg-[#5b86ff]" />
                                            <div className="text-lg font-extrabold text-gray-900">ชั้นที่ {floor}</div>
                                            <div className="text-sm font-bold text-gray-600">· {countHint} ห้อง</div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => selectAllOnFloor(floor)}
                                                className="h-[44px] px-5 rounded-xl bg-white border border-blue-200 text-blue-700 font-extrabold text-sm shadow-sm hover:bg-blue-50 active:scale-[0.98]
                                 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                            >
                                                เลือกทั้งชั้น
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => unselectAllOnFloor(floor)}
                                                className="h-[44px] px-5 rounded-xl bg-white border border-gray-200 text-gray-700 font-extrabold text-sm shadow-sm hover:bg-gray-50 active:scale-[0.98]
                                 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                            >
                                                ยกเลิกทั้งชั้น
                                            </button>
                                        </div>
                                    </div>

                                    <div className="px-6 py-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                            {floorRooms.map((r) => {
                                                const isSelected = selectedSet.has(r.id);
                                                const service = getService(r.serviceId);

                                                return (
                                                    <button
                                                        key={r.id}
                                                        type="button"
                                                        onClick={() => toggleRoom(r.id)}
                                                        className={[
                                                            "rounded-2xl border px-6 py-5 bg-white shadow-sm transition text-left",
                                                            "active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-200",
                                                            isSelected
                                                                ? "border-blue-300 ring-4 ring-blue-200/60"
                                                                : "border-blue-100/70 hover:border-blue-200",
                                                        ].join(" ")}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-base font-extrabold text-gray-900">ห้อง {r.roomNo}</div>

                                                            <div
                                                                className={[
                                                                    "h-[34px] px-3 rounded-xl text-xs font-extrabold border flex items-center",
                                                                    isSelected
                                                                        ? "bg-blue-600 text-white border-blue-600"
                                                                        : "bg-white text-gray-700 border-gray-200",
                                                                ].join(" ")}
                                                            >
                                                                {isSelected ? "เลือกแล้ว" : "เลือก"}
                                                            </div>
                                                        </div>

                                                        <div
                                                            className={[
                                                                "mt-4 inline-flex items-center px-4 py-2 rounded-xl border text-sm font-extrabold",
                                                                service
                                                                    ? "bg-blue-50 border-blue-200 text-blue-900"
                                                                    : "bg-gray-50 border-gray-200 text-gray-700",
                                                            ].join(" ")}
                                                        >
                                                            {service
                                                                ? `${service.label} · ${service.price.toLocaleString()} บาท`
                                                                : "ยังไม่ได้เลือกค่าบริการ"}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-6 text-sm font-bold text-gray-600">
                                            ชั้นนี้มี <span className="font-extrabold text-gray-900">{countHint}</span> ห้อง
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="flex items-center justify-end gap-[14px] flex-wrap pt-5">
                <div className="h-[46px] min-w-[260px] px-6 rounded-xl bg-[#161A2D] text-white flex items-center justify-center shadow-[0_12px_22px_rgba(0,0,0,0.18)] font-extrabold text-sm">
                    จำนวนห้องที่เลือก {selectedCount} ห้อง
                </div>

                <button
                    type="button"
                    onClick={openAssign}
                    disabled={selectedCount === 0}
                    className={[
                        "h-[46px] px-5 rounded-xl border-0 font-extrabold text-sm transition shadow-[0_12px_22px_rgba(0,0,0,0.18)]",
                        "focus:outline-none focus:ring-2 focus:ring-blue-300",
                        selectedCount === 0
                            ? "bg-[#93C5FD]/40 cursor-not-allowed text-white/70"
                            : "bg-[#93C5FD] hover:bg-[#7fb4fb] active:scale-[0.98] cursor-pointer text-white",
                    ].join(" ")}
                >
                    ระบุค่าบริการ
                </button>

                <button
                    type="button"
                    onClick={() => {
                        unlockStep(9);
                        nav("../step-9");
                    }}
                    className="h-[46px] w-24 rounded-xl border-0 text-white font-black text-sm shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition
                   bg-[#93C5FD] hover:bg-[#7fb4fb] active:scale-[0.98] cursor-pointer
                   focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                    ต่อไป
                </button>
            </div>

            {openModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setOpenModal(false)} />

                    <div
                        className="relative w-full max-w-[560px] rounded-2xl bg-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] overflow-hidden border border-blue-100/60"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center gap-3 px-7 py-5 bg-[#f3f7ff] border-b border-blue-100/60">
                            <div className="h-8 w-1.5 rounded-full bg-[#5b86ff]" />
                            <div>
                                <div className="text-lg font-extrabold text-gray-900 tracking-tight">ระบุค่าบริการเพิ่มเติม</div>
                                <div className="mt-1 text-xs font-bold text-gray-600">
                                    เลือกบริการให้กับ {selectedCount.toLocaleString()} ห้องที่เลือก
                                </div>
                            </div>
                        </div>

                        <div className="px-7 py-6">
                            <div className="text-sm font-bold text-gray-700 mb-2">
                                บริการ <span className="text-rose-600">*</span>
                            </div>

                            <select
                                value={serviceId === "" ? "" : String(serviceId)}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setServiceId(v === "" ? "" : Number(v));
                                }}
                                title="เลือกบริการ"
                                className="w-full h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-extrabold text-gray-900 shadow-sm
                           focus:outline-none focus:ring-4 focus:ring-blue-200/60 focus:border-blue-300"
                            >
                                <option value="">เลือกบริการ</option>
                                {serviceOptions.map((o) => (
                                    <option key={String(o.id)} value={String(o.id)}>
                                        {o.label} · {o.price.toLocaleString()} บาท
                                    </option>
                                ))}
                            </select>

                            <div className="mt-3 text-xs font-bold text-gray-500">
                                หากไม่ต้องการค่าบริการ ให้กด “ลบค่าบริการ”
                            </div>
                        </div>

                        <div className="px-7 py-5 bg-white border-t border-blue-100/60 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenModal(false)}
                                className="h-[44px] px-6 rounded-xl bg-white border border-gray-200 text-gray-800 font-extrabold text-sm shadow-sm hover:bg-gray-50 active:scale-[0.98] transition
                           focus:outline-none focus:ring-2 focus:ring-gray-200"
                            >
                                ปิด
                            </button>

                            <button
                                type="button"
                                onClick={onRemoveService}
                                disabled={selectedCount === 0}
                                className={[
                                    "h-[44px] px-6 rounded-xl bg-white border font-extrabold text-sm shadow-sm transition active:scale-[0.98]",
                                    "focus:outline-none focus:ring-2",
                                    selectedCount === 0
                                        ? "border-rose-100 text-rose-300 cursor-not-allowed"
                                        : "border-rose-200 text-rose-700 hover:bg-rose-50 focus:ring-rose-200",
                                ].join(" ")}
                            >
                                ลบค่าบริการ
                            </button>

                            <button
                                type="button"
                                disabled={!selectedService}
                                onClick={onSaveService}
                                className={[
                                    "h-[44px] px-7 rounded-xl border-0 text-white font-extrabold text-sm shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition",
                                    "focus:outline-none focus:ring-2 focus:ring-blue-300",
                                    selectedService
                                        ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] cursor-pointer"
                                        : "bg-blue-200 cursor-not-allowed text-white/70 shadow-none",
                                ].join(" ")}
                            >
                                บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
