import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/*
 * IMPORTANT
 * the ?place query string IS ONLY processed by the /app route.
 * you have to use the query with /app?place=foo NOT /?place=foo
 *
 * The place store is used to identify the museusm or insitution
 * where the user most recently scanned a qr code
 * this is saved in state and session storage so it isn't
 * persisted long term so users can visit many different places
 *
 * How it works, the app loader looks for a query string 'place' value
 * and sets it as a cookie and passes to the app/view.tsx if found.
 *
 * To access directly
 * const activePlace = usePlaceStore.getState().activePlace;
 *
 * To subscribe to changes in a reactive component
 * const activePlace = usePlaceStore((state) => state.activePlace);
 */
type PlaceState = {
  activePlace: string;
  setActivePlace: (place: string) => void;
};

export const usePlaceStore = create(
  persist<PlaceState>(
    (set) => ({
      activePlace: "wonderway",
      setActivePlace: (place) => set({ activePlace: place }),
    }),
    {
      name: "place-session",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
