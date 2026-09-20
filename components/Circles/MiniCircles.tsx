import { motion } from "motion/react";
import { forwardRef } from "react";

import { CirclesProps } from "./Circles.types";

export const MiniCircles = forwardRef<HTMLDivElement, CirclesProps>(
  ({ mode, className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        {...rest}
        className={`relative flex items-center justify-center size-[60px] ${className ?? ""}`}
      >
        <div className="relative size-[60px]">
          {/* XL Circle */}
          <motion.div
            key="xl-circle"
            animate={mode}
            className="absolute inset-0 z-10"
            initial="idle"
            variants={{
              processing: {
                x: 0,
                y: -25,
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                  y: {
                    duration: 0.3,
                    ease: "easeInOut",
                  },
                },
              },

              idle: {
                x: 0,
                y: [-25, -29, -25],
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

              preconnect: {
                x: 0,
                y: -34,
                scale: 0.85,
                transition: {
                  x: { duration: 0.1, ease: "easeInOut" },
                  y: { duration: 0.1, ease: "easeInOut" },
                  scale: { duration: 0.1, ease: "easeInOut" },
                },
              },

              connected: {
                x: 0,
                y: [-34, -36, -34],
                scale: 0.85,
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
                y: -34,
                scale: [0.8, 0.85, 0.8, 0.75, 0.8, 0.85, 0.8],
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
            <div className="bg-black rounded-full size-[60px]" />
          </motion.div>

          {/* L Circle */}
          <motion.div
            key="lg-circle"
            animate={mode}
            className="absolute inset-0 z-20"
            initial="idle"
            variants={{
              processing: {
                y: -25,
                scale: 0.95,
                transition: {
                  scale: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                },
              },

              idle: {
                x: 0,
                y: [-25, -20, -25],
                scale: 1,
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
                  scale: {
                    duration: 0.4,
                    ease: "easeInOut",
                  },
                },
              },

              preconnect: {
                y: 6,
                scale: 0.75,
                transition: {
                  y: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                  scale: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                },
              },

              connected: {
                x: 0,
                y: [6, 5, 6],
                scale: 0.75,
                transition: {
                  x: {
                    duration: 0.6,
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
                y: 6,
                scale: [0.75, 0.8, 0.75, 0.7, 0.75, 0.8, 0.75],
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
                absolute rounded-full size-[30px]
                top-1/2 left-1/2
                -translate-y-1/2 -translate-x-1/2
                ${
                  mode === "speaking" ||
                  mode === "preconnect" ||
                  mode === "connected"
                    ? "bg-black"
                    : "bg-paper"
                }
              `}
            />
          </motion.div>

          {/* M Circle */}
          <motion.div
            key="md-circle"
            animate={mode}
            initial="idle"
            className="absolute inset-0 z-30"
            variants={{
              processing: {
                rotate: 360,
                y: -25,
                scale: 1,
                transition: {
                  rotate: {
                    repeat: Infinity,
                    duration: 1.8,
                    ease: "circInOut",
                  },
                  y: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                  scale: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                },
              },

              idle: {
                x: 0,
                y: [-25, -21, -25],
                scale: 1.2,
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                  scale: {
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

              preconnect: {
                y: 28,
                scale: 0.75,
                transition: {
                  y: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                  scale: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                },
              },

              connected: {
                x: 0,
                y: [28, 25, 28],
                scale: 0.8,
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
                y: 28,
                scale: [0.8, 0.85, 0.8, 0.75, 0.8, 0.85, 0.8],
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
          >
            <div
              className={`
                absolute origin-center rounded-full size-2.5
                left-1/2 -translate-x-1/2
                top-1/2 -translate-y-1/2
                ${mode === "processing" ? "top-[5px]" : ""}
                ${
                  mode === "speaking" ||
                  mode === "idle" ||
                  mode === "connected" ||
                  mode === "preconnect"
                    ? "bg-black"
                    : "bg-paper"
                }
              `}
            />
          </motion.div>

          {/* SM Circle */}
          <motion.div
            key="sm-circle"
            animate={mode}
            initial="idle"
            className="absolute inset-0 z-40"
            variants={{
              idle: {
                x: 0,
                y: [-50, -45, -50],
                scale: 1,
                transition: {
                  x: {
                    duration: 0.6,
                    ease: "easeInOut",
                  },
                  y: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 7,
                    ease: "easeInOut",
                  },
                  scale: {
                    duration: 0.4,
                    ease: "easeInOut",
                  },
                },
              },

              processing: {
                rotate: -360,
                y: -25,
                left: -5,
                transition: {
                  rotate: {
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "linear",
                  },
                },
              },

              preconnect: {
                y: -54,
                scale: 0.75,
                transition: {
                  y: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                  scale: {
                    duration: 0.1,
                    ease: "easeInOut",
                  },
                },
              },

              connected: {
                x: 0,
                y: [-54, -16, -54],
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
                y: -48,
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
          >
            <div
              className={`
                absolute origin-center rounded-full size-[4px]
                top-1/2 -translate-y-1/2
                ${
                  mode === "processing"
                    ? "left-[-4px]"
                    : "left-1/2 -translate-x-1/2"
                }
                ${mode === "processing" ? "bg-fuchsia-600" : "bg-paper"}
              `}
            />
          </motion.div>
        </div>
      </div>
    );
  },
);
