import React, { useState, useRef, useEffect } from "react";

export function Stopwatch() {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Browser-safe interval type
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      const start = Date.now() - time;

      intervalRef.current = window.setInterval(() => {
        setTime(Date.now() - start);
      }, 100);
    } else if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const handleStartStop = () => setIsRunning((prev) => !prev);

  const handleReset = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setTime(0);
  };

  const seconds = (time / 1000).toFixed(1);

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleStartStop}
        className={`px-6 py-3 rounded-2xl text-xl font-mono transition-colors duration-200
          ${isRunning ? "bg-red-500 text-white" : "bg-green-500 text-white"}
        `}
      >
        {seconds}s
      </button>
      <button
        onClick={handleReset}
        className="px-6 py-3 rounded-xl text-lg bg-gray-300 hover:bg-gray-400 text-black transition-colors duration-200"
      >
        Reset
      </button>
    </div>
  );
}
