import React, { useState } from "react";

import { Circles } from "components/Circles/Circles";

const Animation: React.FC = () => {
  const [mode, setMode] = useState<
    "processing" | "idle" | "connected" | "error" | "speaking"
  >("idle");

  return (
    <>
      <div className="fixed w-dvw h-dvh top-0 left-0">
        <Circles mode={mode}></Circles>
      </div>

      <div className="absolute bottom-4 left-4 flex gap-2 z-50">
        <button
          onClick={() => setMode("processing")}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Processing
        </button>
        <button
          onClick={() => setMode("idle")}
          className="px-4 py-2 bg-gray-500 text-white rounded"
        >
          Idle
        </button>
        <button
          onClick={() => setMode("connected")}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Connected
        </button>
        <button
          onClick={() => setMode("speaking")}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Speaking
        </button>
        <button
          onClick={() => setMode("error")}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          Error
        </button>
      </div>
    </>
  );
};

export default Animation;
