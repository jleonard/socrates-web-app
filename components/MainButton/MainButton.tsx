import React from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { MainButtonProps, MainButtonModes } from "./MainButton.types";
import { MainButtonStyles } from "./MainButton.styles";

import MicrophoneIcon from "./icons/Microphone.png";
import { LoaderCircle } from "lucide-react";

export const MainButton = React.forwardRef<HTMLButtonElement, MainButtonProps>(
  (props, ref) => {
    const { className, mode, userAccess, expiration, children, ...rest } =
      props;

    // used to set the text under the button
    const stateText: Record<MainButtonModes, string | null> = {
      disconnected: "Press to talk",
      listening: "Ask away",
      speaking: "Talking",
      connecting: "Just a moment",
    };

    function getTimeRemainingLabel(expiration: string) {
      const end = new Date(expiration);
      const now = new Date();
      const diffMs = end.getTime() - now.getTime();

      /*
      console.log("getTimeRemaining()");
      console.log("expiration:", expiration);
      console.log("end:", new Date(expiration));
      console.log("diffMs:", diffMs);
      */

      if (diffMs <= 0) return "";

      const minutes = Math.floor(diffMs / 60_000);
      if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
      }

      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
      }

      const days = Math.floor(hours / 24);
      if (days < 7) {
        return `${days} day${days === 1 ? "" : "s"} remaining`;
      }

      if (days < 30) {
        const weeks = Math.floor(days / 7);
        return `${weeks} week${weeks === 1 ? "" : "s"} remaining`;
      }

      const months = Math.floor(days / 30);
      return `${months} month${months === 1 ? "" : "s"} remaining`;
    }

    return (
      <>
        {userAccess !== "unused" && (
          <span className="fixed left-1/2 -translate-x-1/2 bottom-36 z-20 text-center">
            {stateText[mode]}
          </span>
        )}
        <ReactAriaButton
          ref={ref}
          className={MainButtonStyles({ mode, className })}
          {...rest}
        >
          <>
            {mode === "connecting" && (
              <LoaderCircle className="animate-spin" size={24} />
            )}
            {mode === "listening" && (
              <img className="size-[36px]" src={MicrophoneIcon} />
            )}

            {mode === "speaking" && (
              <img src="/icons/Stop.svg" className="size-[26px]" />
            )}

            {mode === "disconnected" && <span className="font-bold">Talk</span>}

            {children}
          </>
        </ReactAriaButton>
        {userAccess !== "unused" && (
          <span className="fixed left-1/2 -translate-x-1/2 bottom-8 z-20 text-center">
            {getTimeRemainingLabel(expiration)}
          </span>
        )}
      </>
    );
  },
);
