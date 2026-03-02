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
    setCondoId: (id: string) => void;
    setStep0: (data: Partial<Step0Data>) => void;
    clear: () => void;
};

export const useCondoWizardStore = create<CondoWizardState>()(
    persist(
        (set) => ({
            condoId: null,
            step0: { ...EMPTY_STEP0 },
            setCondoId: (id) => set({ condoId: id }),
            setStep0: (data) =>
                set((s) => ({ step0: { ...s.step0, ...data } })),
            clear: () => set({ condoId: null, step0: { ...EMPTY_STEP0 } }),
        }),
        { name: "rentsphere_condo_wizard" }
    )
);
