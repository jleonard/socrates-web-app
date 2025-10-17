import clsx from "clsx";
import React, { ReactElement } from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { PurchaseButtonProps } from "./PurchaseButton.types";
import { PurchaseButtonStyles } from "./PurchaseButton.styles";

export const PurchaseButton = React.forwardRef<
  HTMLButtonElement,
  PurchaseButtonProps
>((props, ref) => {
  const { className, cta, children, onClick, ...rest } = props;

  return (
    <>
      <div className={clsx("rounded-full size-[253px] bg-white", className)}>
        <span className="absolute w-4/6 flex flex-col text-center items-center justify-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {cta}
        </span>
        <ReactAriaButton
          ref={ref}
          onClick={onClick}
          className={PurchaseButtonStyles({
            class: "absolute bottom-0 left-1/2 -translate-x-1/2",
          })}
          {...rest}
        >
          {children}
        </ReactAriaButton>
      </div>
    </>
  );
});
