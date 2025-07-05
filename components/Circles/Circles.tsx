import { forwardRef } from "react";
import { motion } from "motion/react";

import { CirclesProps } from "./Circles.types";
import { CircleStyles } from "./Circle.styles";

const CircleXL = {
  idle: {
    className: "",
    motion: {},
  },
  processing: {},
};

export const Circles = forwardRef<HTMLDivElement, CirclesProps>(
  ({ mode, className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        {...rest}
        className="relative flex items-center justify-center w-dvw h-dvh"
      >
        {mode === "processing" && (
          <div className="relative size-60">
            {/* XL Circle */}
            <div className="absolute inset-0 bg-black rounded-full z-10" />

            {/* L Circle */}
            <div className="absolute inset-0 bg-paper rounded-full z-20 size-[144px] top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2" />

            {/* M Circle */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                repeat: Infinity,
                duration: 2.3,
                ease: "circInOut",
              }}
              className="absolute inset-0 z-30"
            >
              <div className="absolute origin-center top-0 left-1/2 -translate-x-1/2 bg-paper rounded-full size-12" />
            </motion.div>

            {/* SM Circle */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                ease: "linear",
              }}
              className="absolute inset-0 z-0"
            >
              <div className="absolute origin-center left-[-16px] top-1/2 -translate-y-1/2 bg-fuchsia-600 rounded-full size-4" />
            </motion.div>
          </div>
        )}
      </div>
    );
  }
);
