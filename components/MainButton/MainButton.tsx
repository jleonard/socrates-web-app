import React from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import {
  MainButtonProps,
  MainButtonModes,
  UserAccessModes,
} from "./MainButton.types";
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

    function getTimeLeft(expiration: string | Date) {
      const end = new Date(expiration);
      const now = new Date();
      const diffMs = end.getTime() - now.getTime();
      const diffMinutes = Math.round(diffMs / 60_000);

      const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

      if (Math.abs(diffMinutes) < 60) {
        return rtf.format(diffMinutes, "minute"); // "24 minutes left"
      }

      const diffHours = Math.round(diffMinutes / 60);
      if (Math.abs(diffHours) <= 24) {
        return rtf.format(diffHours, "hour"); // "2 hours left"
      }

      const diffDays = Math.round(diffHours / 24);
      if (diffDays === 1) {
        return "1 day";
      }
      return rtf.format(diffDays, "day"); // "3 days left"
    }

    return (
      <>
        {userAccess !== "unused" && (
          <span className="fixed left-1/2 -translate-x-1/2 bottom-44 z-20">
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
          <span className="fixed left-1/2 -translate-x-1/2 bottom-10 z-20">
            {getTimeLeft(expiration)} remaining
          </span>
        )}
      </>
    );
  },
);
