import { forwardRef } from "react";
import { motion } from "motion/react";

import { CirclesProps } from "./Circles.types";

export const Circles = forwardRef<HTMLDivElement, CirclesProps>(
  ({ mode, className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        {...rest}
        className="relative flex items-center justify-center w-dvw h-dvh"
      >
        <div className="relative size-60">
          {/* XL Circle */}
          <motion.div
            animate={mode}
            className="animation inset-0 z-10"
            variants={{
              processing: {},
              idle: {
                x: 0,
                y: 0,
                scale: 1,
              },
              connected: {
                x: 0,
                y: -150,
                scale: 1,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 0.1,
                    ease: "linear",
                  },
                },
              },
              speaking: {
                x: "-100px", // Move left once
                scale: 0.5,
                y: [0, -20, 0], // Bounce loop
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 1.2,
                    ease: "easeInOut",
                  },
                },
              },
            }}
          >
            <div className="bg-black rounded-full size-60" />
          </motion.div>

          {/* L Circle */}
          <motion.div
            animate={mode}
            className="absolute inset-0 z-20"
            variants={{
              processing: { y: "0" },
              idle: {
                y: [0, 30, 0],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 4,
                    ease: "easeInOut",
                  },
                },
              },
              connected: {
                x: 0,
                y: 50,
                scale: 1,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 0.1,
                    ease: "linear",
                  },
                },
              },
              speaking: {
                x: "-20px", // Move left once
                scale: 0.6,
                y: [0, 10, 0], // Bounce loop
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 0.8,
                    ease: "easeInOut",
                  },
                },
              },
            }}
          >
            <div
              className={`
                absolute rounded-full size-[144px] top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2
                transition-colors duration-300
                ${
                  mode === "speaking" || mode === "connected"
                    ? "bg-black"
                    : "bg-paper"
                }
              `}
            />
          </motion.div>

          {/* M Circle */}
          <motion.div
            animate={mode}
            variants={{
              processing: {
                rotate: 360,
                y: 0,
                transition: {
                  rotate: {
                    repeat: Infinity,
                    duration: 2.3,
                    ease: "circInOut",
                  },
                },
              },
              idle: {
                y: [80, 180, 80],
                scale: 1.2,
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 5,
                    ease: "easeInOut",
                  },
                },
              },
              connected: {
                x: 0,
                y: 290,
                scale: 1.3,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 0.1,
                    ease: "linear",
                  },
                },
              },
              speaking: {
                x: "40px", // Move left once
                y: [90, 130, 90], // Bounce loop
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 0.9,
                    ease: "easeInOut",
                  },
                },
              },
            }}
            className="absolute inset-0 z-30"
          >
            <div
              className={`absolute origin-center top-0 left-1/2 -translate-x-1/2 rounded-full size-12 ${
                mode === "speaking" || mode === "idle" || mode === "connected"
                  ? "bg-black"
                  : "bg-paper"
              }`}
            />
          </motion.div>

          {/* SM Circle */}
          <motion.div
            animate={mode}
            variants={{
              idle: {
                y: [-100, -70, -100],
                left: "125px",
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 7,
                    ease: "easeInOut",
                  },
                },
              },
              processing: {
                rotate: -360,
                y: 0,
                left: -20,
                transition: {
                  rotate: {
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "linear",
                  },
                },
              },
              connected: {
                x: 165,
                y: -55,
                scale: 1.3,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 0.1,
                    ease: "linear",
                  },
                },
              },
            }}
            className="absolute inset-0 z-40"
          >
            <div
              className={`absolute origin-center left-[-16px] top-1/2 -translate-y-1/2 rounded-full size-4 ${
                mode === "idle" || mode === "connected"
                  ? "bg-paper"
                  : "bg-fuchsia-600"
              }`}
            />
          </motion.div>
        </div>
      </div>
    );
  }
);
