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
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                  y: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                  scale: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                },
              },
              connected: {
                x: 0,
                y: [-145, -155, -145],
                scale: 1,
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                  y: {
                    duration: 3,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop",
                  },
                  scale: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                },
              },
              speaking: {
                x: 0,
                y: -135,
                scale: [0.95, 1, 0.95, 0.9, 0.95, 1, 0.95],
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  scale: {
                    duration: 1.5,
                    repeatType: "loop",
                    repeat: Infinity,
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
                x: 0,
                y: [0, 30, 0],
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
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
                y: [65, 50, 65],
                scale: 1,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 3,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop",
                  },
                },
              },
              speaking: {
                x: 0,
                y: 65,
                scale: [0.95, 1, 0.95, 0.9, 0.95, 1, 0.95],
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  scale: {
                    duration: 1,
                    repeatType: "loop",
                    repeat: Infinity,
                  },
                },
              },
            }}
          >
            <div
              className={`
                absolute rounded-full size-[144px] 
                transition-colors duration-100 top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2
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
                x: 0,
                y: [60, 30, 60],
                scale: 1.2,
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
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
                y: [185, 175, 185],
                scale: 1.3,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 3,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop",
                  },
                },
              },
              speaking: {
                x: 0, // Move left once
                y: 175,
                scale: [0.95, 1, 0.95, 0.9, 0.95, 1, 0.95],
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  scale: {
                    duration: 0.9,
                    repeatType: "mirror",
                    repeat: Infinity,
                  },
                },
              },
            }}
            className="absolute inset-0 z-30"
          >
            <div
              className={`absolute origin-center rounded-full size-12 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2
                ${mode === "processing" && "top-6"}
                ${
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
                x: 0,
                y: [-100, -70, -100],
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
                x: 0,
                y: [-235, -55, -235],
                scale: 1.3,
                transition: {
                  x: {
                    duration: 0.1,
                    ease: "linear",
                  },
                  y: {
                    duration: 3,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop",
                  },
                },
              },
              speaking: {
                x: 0,
                y: -215,
                scale: [1.3, 1.1, 1.2, 1.1, 1.2, 1, 1.3],
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeOut",
                  },
                  y: {
                    duration: 0.7,
                    ease: "easeOut",
                  },
                  scale: {
                    duration: 3,
                    repeatType: "loop",
                    repeat: Infinity,
                  },
                },
              },
            }}
            className="absolute inset-0 z-40"
          >
            <div
              className={`absolute origin-center rounded-full size-4 transition-all top-1/2 -translate-y-1/2
                ${
                  mode === "processing"
                    ? "left-[-16px]"
                    : "left-1/2 -translate-x-1/2"
                }
              ${mode === "processing" ? "bg-fuchsia-600" : "bg-paper"}`}
            />
          </motion.div>
        </div>
      </div>
    );
  }
);
