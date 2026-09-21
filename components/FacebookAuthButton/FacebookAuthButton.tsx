import React from "react";
import { siFacebook } from "simple-icons";

import { FacebookAuthButtonProps } from "./FacebookAuthButton.types";

export const FacebookAuthButton = React.forwardRef<
  HTMLButtonElement,
  FacebookAuthButtonProps
>((props, ref) => {
  const { className, label = "Continue with Facebook", ...rest } = props;

  return (
    <>
      <button
        style={{ width: "364px" }}
        className="social-button border border-[#E6EAED]"
        {...rest}
      >
        <svg
          className="size-[23px] text-[#1877f2]"
          role="img"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d={siFacebook.path} />
        </svg>
        <span>{label}</span>
      </button>
    </>
  );
});
