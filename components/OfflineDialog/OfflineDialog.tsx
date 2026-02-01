import { X } from "lucide-react";
import { useState } from "react";

export function OfflineDialog() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[88%] min-h-[646px] h-96 flex items-center justify-center gap-4 bg-ayapi-pink text-white rounded-2xl z-50">
      <div className="flex flex-col gap-4 justify-center items-center text-center">
        <img src="/icons/Offline.svg" className="w-[179px]" alt="offline" />
        <h1 className="text-4xl font-semibold">You're offline</h1>
        <p>
          Connect to Internet to
          <br /> continue your journey
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
  );
}
