import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Step0Data = {
    nameTh: string;
    addressTh: string;
    nameEn: string;
    addressEn: string;
    phoneNumber: string;
    taxId: string;
    paymentDueDate: string;
    fineAmount: string;
    acceptFine: boolean;
};

export type WizardRoomDraft = {
    id: string;
    condoId?: string;
    floor: number;
    roomNo: string;
    price: number | null;
    serviceId: number | null;
    isActive: boolean;
    status: "VACANT" | "OCCUPIED";
};

const EMPTY_STEP0: Step0Data = {
    nameTh: "",
    addressTh: "",
    nameEn: "",
    addressEn: "",
    phoneNumber: "",
    taxId: "",
    paymentDueDate: "",
    fineAmount: "",
    acceptFine: false,
};

type CondoWizardState = {
    condoId: string | null;
    step0: Step0Data;
    draftRooms: WizardRoomDraft[];
    wizardMode: "strict" | "edit";
    maxUnlockedStep: number;
    setCondoId: (id: string) => void;
    setStep0: (data: Partial<Step0Data>) => void;
    setDraftRooms: (rooms: WizardRoomDraft[]) => void;
    clearDraftRooms: () => void;
    setWizardMode: (mode: "strict" | "edit") => void;
    unlockStep: (step: number) => void;
    resetFlow: (mode?: "strict" | "edit") => void;
    clear: () => void;
};

export const useCondoWizardStore = create<CondoWizardState>()(
    persist(
        (set) => ({
            condoId: null,
            step0: { ...EMPTY_STEP0 },
            draftRooms: [],
            wizardMode: "strict",
            maxUnlockedStep: 0,
            setCondoId: (id) => set({ condoId: id }),
            setStep0: (data) =>
                set((s) => ({ step0: { ...s.step0, ...data } })),
            setDraftRooms: (rooms) => set({ draftRooms: rooms }),
            clearDraftRooms: () => set({ draftRooms: [] }),
            setWizardMode: (mode) =>
                set({
                    wizardMode: mode,
                    maxUnlockedStep: mode === "edit" ? 9 : 0,
                }),
            unlockStep: (step) =>
                set((s) => ({
                    maxUnlockedStep:
                        s.wizardMode === "edit"
                            ? 9
                            : Math.max(s.maxUnlockedStep, Math.max(0, Math.min(9, step))),
                })),
            resetFlow: (mode = "strict") =>
                set({
                    wizardMode: mode,
                    maxUnlockedStep: mode === "edit" ? 9 : 0,
                }),
            clear: () =>
                set({
                    condoId: null,
                    step0: { ...EMPTY_STEP0 },
                    draftRooms: [],
                    wizardMode: "strict",
                    maxUnlockedStep: 0,
                }),
        }),
        { name: "rentsphere_condo_wizard" }
    )
);
