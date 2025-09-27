import React from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { MainButtonProps, MainButtonModes } from "./MainButton.types";
import { MainButtonStyles } from "./MainButton.styles";

import XIcon from "./icons/x.png";
import MicrophoneIcon from "./icons/Microphone.png";
import { LoaderCircle } from "lucide-react";

export const MainButton = React.forwardRef<HTMLButtonElement, MainButtonProps>(
  (props, ref) => {
    const { className, mode, children, ...rest } = props;

    // used to set the text under the button
    const stateText: Record<MainButtonModes, string | null> = {
      disconnected: "Press to talk",
      listening: "Ask away",
      speaking: "Talking",
      connecting: "Just a moment",
    };

    return (
      <>
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
            {mode === "speaking" && <img className="size-[24px]" src={XIcon} />}

            {mode === "disconnected" && <span className="font-bold">Talk</span>}

            {children}
          </>
        </ReactAriaButton>

        <span className="fixed left-1/2 -translate-x-1/2 bottom-12 z-20">
          {stateText[mode]}
        </span>
      </>
    );
  }
);
