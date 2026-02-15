import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/*
 * The place store is used to identify the museusm or insitution
 * where the user most recently scanned a qr code
 * this is saved in state and session storage so it isn't
 * persisted long term so users can visit many different places
 *
 * How it works, the root.tsx looks for a query string 'place' value
 * and sets it in the store if found.
 *
 * To access directly
 * const activePlace = usePlaceStore.getState().activePlace;
 *
 * To subscribe to changes in a reactive component
 * const activePlace = usePlaceStore((state) => state.activePlace);
 */
type PlaceState = {
  activePlace: string | null;
  setActivePlace: (place: string | null) => void;
};

export const usePlaceStore = create(
  persist<PlaceState>(
    (set) => ({
      activePlace: null,
      setActivePlace: (place) => set({ activePlace: place }),
    }),
    {
      name: "place-session",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
