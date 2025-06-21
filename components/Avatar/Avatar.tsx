import { forwardRef } from "react";

import { barOne, barTwo, barThree, barFour } from "./Avatar.styles";
import { AvatarProps } from "./Avatar.types";

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ mode, className, ...rest }, ref) => {
    return (
      <div ref={ref} {...rest} className="flex flex-row items-center gap-1 h-9">
        {mode === "speaking" &&
          Array.from({ length: 10 }).map((_, index) => {
            const randomDuration =
              Math.floor(Math.random() * (560 - 420 + 1)) + 420;
            const animations = [
              "animate-equalizerSmall",
              "animate-equalizerMedium",
              "animate-equalizerLarge",
            ];
            /* const animationClass =
              animations[Math.floor(Math.random() * animations.length)];
              */
            const animationClass =
              index < 2
                ? animations[0]
                : index > 7
                ? animations[1]
                : animations[2];
            return (
              <div
                key={index}
                className={`w-1 h-2 bg-black transition ${animationClass}`}
                style={{ animationDuration: `${randomDuration}ms` }}
              ></div>
            );
          })}

        {mode === "listening" &&
          Array.from({ length: 8 }).map((_, index) => {
            return (
              <div
                key={index}
                className={`w-1 h-12 bg-black transition animate-listening`}
                style={{ animationDelay: `${index * 100}ms` }}
              ></div>
            );
          })}

        {mode === "idle" &&
          Array.from({ length: 8 }).map((_, index) => {
            return (
              <div
                key={index}
                className={`w-1 h-12 bg-black transition animate-listening`}
                style={{ animationDelay: `${index * 100}ms` }}
              ></div>
            );
          })}
      </div>
    );
  }
);
