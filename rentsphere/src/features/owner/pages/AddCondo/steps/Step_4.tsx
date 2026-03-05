import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createFloors, getMyCondo, getRooms, syncRoomsLayout } from "../condoApi";
import { useCondoWizardStore } from "../condoWizard.store";

export default function Step_4() {
  const nav = useNavigate();
  const condoId = useCondoWizardStore((s) => s.condoId);
  const unlockStep = useCondoWizardStore((s) => s.unlockStep);
  const wizardMode = useCondoWizardStore((s) => s.wizardMode);
  const setDraftRooms = useCondoWizardStore((s) => s.setDraftRooms);
  const draftRooms = useCondoWizardStore((s) => s.draftRooms);

  const [floorCount, setFloorCount] = useState<number | "">("");
  const [roomsPerFloorText, setRoomsPerFloorText] = useState<string[]>([]);
  const [roomErrors, setRoomErrors] = useState<Record<number, string>>({});
  const initialSnapshotRef = useRef<{ floorCount: number; roomsPerFloorText: string[] } | null>(null);

  const hasRoomError = Object.keys(roomErrors).length > 0;
  const canGoNext = floorCount !== "" && !hasRoomError;

  const buildDraftRoomsFromPlan = (nextFloorCount: number, nextRoomsPerFloor: number[]) => {
    const byFloor = new Map<number, typeof draftRooms>();
    draftRooms.forEach((room) => {
      const arr = byFloor.get(room.floor) ?? [];
      arr.push(room);
      byFloor.set(room.floor, arr);
    });
    byFloor.forEach((arr) =>
      arr.sort((a, b) => {
        const ai = Number(a.id.split("-")[1] ?? "0");
        const bi = Number(b.id.split("-")[1] ?? "0");
        if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
        return a.roomNo.localeCompare(b.roomNo);
      })
    );

    const next: typeof draftRooms = [];
    for (let floor = 1; floor <= nextFloorCount; floor++) {
      const existing = byFloor.get(floor) ?? [];
      const count = nextRoomsPerFloor[floor - 1] ?? 1;
      for (let i = 0; i < count; i++) {
        const prev = existing[i];
        next.push({
          id: `${floor}-${i + 1}`,
          condoId: prev?.condoId,
          floor,
          roomNo: `${floor}${String(i + 1).padStart(2, "0")}`,
          price: prev?.price ?? null,
          serviceId: prev?.serviceId ?? null,
          isActive: prev?.isActive ?? true,
          status: prev?.status ?? "VACANT",
        });
      }
    }
    return next;
  };

  // ✅ โหลดข้อมูลชั้น/ห้องเดิมจาก DB
  useEffect(() => {
    if (draftRooms.length > 0) {
      const floorCountFromDraft = draftRooms.reduce((m, r) => Math.max(m, r.floor), 0);
      const perFloor: string[] = [];
      for (let f = 1; f <= floorCountFromDraft; f++) {
        const count = draftRooms.filter((r) => r.floor === f).length;
        perFloor.push(String(count));
      }
      setFloorCount(floorCountFromDraft);
      setRoomsPerFloorText(perFloor);
      initialSnapshotRef.current = {
        floorCount: floorCountFromDraft,
        roomsPerFloorText: perFloor,
      };
      return;
    }

    if (!condoId) return;
    let cancelled = false;
    (async () => {
      try {
        const [condoData, roomData] = await Promise.all([getMyCondo(), getRooms()]);
        if (cancelled) return;
        const fc = condoData.condo?.floorCount || condoData.condo?.floor_count || 0;
        const rooms = roomData.rooms || [];

        if (fc > 0 && rooms.length > 0) {
          const perFloor: string[] = [];
          for (let f = 1; f <= fc; f++) {
            const count = rooms.filter((r: any) => r.floor === f).length;
            perFloor.push(String(count));
          }
          setFloorCount(fc);
          setRoomsPerFloorText(perFloor);
          initialSnapshotRef.current = {
            floorCount: fc,
            roomsPerFloorText: perFloor,
          };
        }
      } catch (e) {
        console.error("load floor/room data error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [condoId, draftRooms]);

  const roomsPerFloorNormalized = useMemo(() => {
    if (floorCount === "") return [];
    return Array.from({ length: floorCount }, (_, i) => {
      const s = roomsPerFloorText[i] ?? "1";
      let n = Number(s);
      if (!Number.isFinite(n)) n = 1;
      return Math.max(1, Math.min(50, n));
    });
  }, [floorCount, roomsPerFloorText]);

  const totalRooms = useMemo(() => {
    return roomsPerFloorNormalized.reduce((sum, n) => sum + n, 0);
  }, [roomsPerFloorNormalized]);

  const handleFloorChange = (value: number | "") => {
    setFloorCount(value);

    if (value === "") {
      setRoomsPerFloorText([]);
      setRoomErrors({});
      return;
    }

    setRoomsPerFloorText(Array.from({ length: value }, () => "1"));
    setRoomErrors({});
  };

  const handleRoomTextChange = (index: number, next: string) => {
    if (!/^\d*$/.test(next)) return;

    setRoomsPerFloorText((prev) => prev.map((v, i) => (i === index ? next : v)));

    if (next === "") {
      setRoomErrors((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      return;
    }

    const value = Number(next);

    if (value > 50) {
      setRoomErrors((prev) => ({ ...prev, [index]: "จำนวนห้องต้องไม่เกิน 50 ห้อง" }));
      return;
    }

    if (value < 1) {
      setRoomErrors((prev) => ({ ...prev, [index]: "จำนวนห้องต้องมากกว่า 0" }));
      return;
    }

    setRoomErrors((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  const normalizeRoomOnBlur = (index: number) => {
    const raw = roomsPerFloorText[index] ?? "";

    if (raw.trim() === "") {
      setRoomsPerFloorText((prev) => prev.map((v, i) => (i === index ? "1" : v)));
      return;
    }

    let n = Number(raw);
    if (!Number.isFinite(n)) n = 1;
    n = Math.max(1, Math.min(50, n));

    setRoomsPerFloorText((prev) => prev.map((v, i) => (i === index ? String(n) : v)));

    setRoomErrors((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  const handleNext = async () => {
    if (floorCount === "" || hasRoomError) return;
    const nextFloorCount = Number(floorCount);
    const nextRoomsPerFloor = roomsPerFloorNormalized;

    const initial = initialSnapshotRef.current;
    const currentRoomsText = roomsPerFloorText.slice(0, nextFloorCount);
    const isUnchangedInEditMode =
      wizardMode === "edit" &&
      !!initial &&
      initial.floorCount === nextFloorCount &&
      initial.roomsPerFloorText.length === currentRoomsText.length &&
      initial.roomsPerFloorText.every((v, i) => v === currentRoomsText[i]);

    if (isUnchangedInEditMode) {
      if (draftRooms.length === 0) {
        setDraftRooms(buildDraftRoomsFromPlan(nextFloorCount, nextRoomsPerFloor));
      }
      unlockStep(5);
      nav("../step-5");
      return;
    }

    const syncedDraft = buildDraftRoomsFromPlan(nextFloorCount, nextRoomsPerFloor);
    try {
      if (wizardMode === "edit") {
        try {
          const data = await syncRoomsLayout({
            floorCount: nextFloorCount,
            rooms: syncedDraft.map((r) => ({
              floor: r.floor,
              roomNo: r.roomNo,
              price: r.price,
              serviceId: r.serviceId,
              isActive: r.isActive,
              status: r.status,
            })),
          });
          const apiDraft = (data.rooms || []).map((r: any) => ({
            id: r.id,
            condoId: condoId || undefined,
            floor: r.floor,
            roomNo: r.room_no || r.roomNo || "",
            price: r.price ?? null,
            serviceId: r.service_id ?? r.serviceId ?? null,
            isActive: r.is_active ?? r.isActive ?? true,
            status: r.status || "VACANT",
          }));
          setDraftRooms(apiDraft);
        } catch (layoutErr) {
          console.error("sync rooms/layout failed, fallback to createFloors:", layoutErr);
          await createFloors({
            floorCount: nextFloorCount,
            roomsPerFloor: nextRoomsPerFloor,
          });
          setDraftRooms(syncedDraft);
        }
      } else {
        await createFloors({
          floorCount: nextFloorCount,
          roomsPerFloor: nextRoomsPerFloor,
        });
        setDraftRooms(syncedDraft);
      }
    } catch (e: any) {
      console.error("save floor/room layout error:", e);
      return;
    }

    initialSnapshotRef.current = {
      floorCount: nextFloorCount,
      roomsPerFloorText: nextRoomsPerFloor.map((n) => String(n)),
    };
    unlockStep(5);
    nav("../step-5");
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
            <div className="text-xl font-extrabold text-gray-900 tracking-tight">จำนวนชั้นและจำนวนห้อง</div>
            <div className="mt-1 text-sm font-bold text-gray-600">
              เลือกจำนวนชั้น และกำหนดจำนวนห้องต่อชั้น (สูงสุด 50 ห้อง) — ระบบคำนวณรวมให้อัตโนมัติ
            </div>
          </div>
        </div>

        <div className="px-8 py-7 space-y-6">
          <div className="max-w-xl">
            <label className="block text-sm font-extrabold text-gray-800 mb-2">
              จำนวนชั้น <span className="text-rose-600">*</span>
            </label>

            <select
              value={floorCount}
              onChange={(e) => handleFloorChange(e.target.value === "" ? "" : Number(e.target.value))}
              title="จำนวนชั้น"
              className="w-full h-14 rounded-2xl border border-gray-200 bg-[#fffdf2] px-5 text-xl font-extrabold text-gray-900 shadow-sm
                         focus:outline-none focus:ring-4 focus:ring-blue-200/60 focus:border-blue-300"
            >
              <option value="">เลือกจำนวนชั้น</option>
              {Array.from({ length: 100 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          {floorCount !== "" && (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div className="text-xl font-extrabold text-gray-900 tracking-tight">
                  จำนวนห้องต่อชั้น <span className="text-sm font-extrabold text-gray-500">(1 - 50)</span>
                </div>

                <div className="h-[46px] min-w-[260px] px-6 rounded-xl bg-[#161A2D] text-white flex items-center justify-center shadow-[0_12px_22px_rgba(0,0,0,0.18)] font-extrabold text-sm">
                  จำนวนชั้น {floorCount || 0} · รวม {totalRooms} ห้อง
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roomsPerFloorText.map((roomText, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-blue-100/60 shadow-sm px-6 py-5 bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-1.5 rounded-full bg-[#5b86ff]" />
                      <div className="text-lg font-extrabold text-gray-900">ชั้นที่ {i + 1}</div>
                    </div>

                    <div className="flex items-end gap-3">
                      <div className="flex flex-col items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={roomText}
                          title="จำนวนห้อง"
                          placeholder="1"
                          onFocus={(e) => e.currentTarget.select()}
                          onClick={(e) => e.currentTarget.select()}
                          onChange={(e) => handleRoomTextChange(i, e.target.value)}
                          onBlur={() => normalizeRoomOnBlur(i)}
                          className={[
                            "w-28 h-12 rounded-2xl border text-center text-xl font-extrabold outline-none transition bg-[#fffdf2] shadow-sm",
                            roomErrors[i]
                              ? "border-rose-300 focus:ring-4 focus:ring-rose-100/70"
                              : "border-gray-200 focus:ring-4 focus:ring-blue-200/60 focus:border-blue-300",
                          ].join(" ")}
                        />
                        {roomErrors[i] && (
                          <div className="mt-1 text-xs font-extrabold text-rose-600">{roomErrors[i]}</div>
                        )}
                      </div>

                      <div className="text-base font-extrabold text-gray-700 pb-2">ห้อง</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hint สำหรับ dev ตอน backend มา */}
              <div className="text-xs font-bold text-gray-500">
                * โครงสำหรับ backend: บันทึก floorCount/roomsPerFloor ก่อน แล้ว Step5 จะไปดึงข้อมูลจาก API แทนการส่ง state
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-[14px] flex-wrap pt-4">
        <button
          type="button"
          disabled={wizardMode !== "edit"}
          onClick={() => nav("../step-3")}
          className={[
            "h-[46px] px-6 rounded-xl border text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-gray-200",
            wizardMode === "edit"
              ? "bg-white border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50 active:scale-[0.98]"
              : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed shadow-none",
          ].join(" ")}
        >
          ย้อนกลับ
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          className={[
            "h-[46px] w-24 rounded-xl border-0 text-white font-black text-sm shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition",
            "focus:outline-none focus:ring-2 focus:ring-blue-300 active:scale-[0.98]",
            canGoNext
              ? "!bg-[#93C5FD] hover:!bg-[#7fb4fb] cursor-pointer"
              : "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none",
          ].join(" ")}
        >
          ต่อไป
        </button>
      </div>
    </div>
  );
}
