import React, { ReactElement } from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { MainButtonProps } from "./MainButton.types";
import { MainButtonStyles } from "./MainButton.styles";

import XIcon from "./icons/x.png";
import MicrophoneIcon from "./icons/Microphone.png";
import { LoaderCircle } from "lucide-react";

export const MainButton = React.forwardRef<HTMLButtonElement, MainButtonProps>(
  (props, ref) => {
    const {
      className,
      active = false,
      loading = false,
      children,
      ...rest
    } = props;

    return (
      <>
        <ReactAriaButton
          ref={ref}
          className={MainButtonStyles({ active, className })}
          {...rest}
        >
          <>
            {loading && <LoaderCircle className="animate-spin" size={24} />}
            {!loading && active && <img className="size-[24px]" src={XIcon} />}
            {!loading && !active && (
              <img className="size-[36px]" src={MicrophoneIcon} />
            )}
            {children}
          </>
        </ReactAriaButton>
      </>
    );
  }
);
