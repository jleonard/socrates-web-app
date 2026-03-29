import { X } from "lucide-react";
import { useState } from "react";

export function OfflineDialog() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <div className="h-screen w-screen bg-black/50 fixed top-0 left-0 z-40"></div>
      <div className="z-50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[88%] min-h-[480px] h-96 flex items-center justify-center gap-4 bg-ayapi-pink text-white rounded-2xl z-50">
        <div className="flex flex-col gap-4 justify-center items-center text-center">
          <img src="/icons/offline.svg" className="w-[200px]" alt="offline" />
          <h1 className="text-4xl font-semibold">You're offline</h1>
          <p className="max-w-56">
            Check your network connection to continue your journey
          </p>
        </div>

        <button
          onClick={() => {
            setIsOpen((prev) => !prev);
          }}
          className="absolute bottom-5 right-8 z-40 hidden"
        >
          <X size={38} strokeWidth={2} />
        </button>
      </div>
    </>
  );
}
