import { create } from "zustand";
import { persist } from "zustand/middleware";

type CondoWizardState = {
    condoId: string | null;
    setCondoId: (id: string) => void;
    clear: () => void;
};

export const useCondoWizardStore = create<CondoWizardState>()(
    persist(
        (set) => ({
            condoId: null,
            setCondoId: (id) => set({ condoId: id }),
            clear: () => set({ condoId: null }),
        }),
        { name: "rentsphere_condo_wizard" }
    )
);
