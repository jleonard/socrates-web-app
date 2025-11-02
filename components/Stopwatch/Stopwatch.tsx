import React, { useState, useRef, useEffect } from "react";

export function Stopwatch() {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Force to use browser-style interval ID (number)
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

  const handleClick = () => setIsRunning((prev) => !prev);

  const seconds = (time / 1000).toFixed(1);

  return (
    <button
      onClick={handleClick}
      className={`px-6 py-3 rounded-2xl text-xl font-mono transition-colors duration-200
        ${isRunning ? "bg-red-500 text-white" : "bg-green-500 text-white"}
      `}
    >
      {seconds}s
    </button>
  );
}
