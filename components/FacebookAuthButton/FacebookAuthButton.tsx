import React from "react";
import { siFacebook } from "simple-icons";

import { useTranslation } from "react-i18next";
import { FacebookAuthButtonProps } from "./FacebookAuthButton.types";

export const FacebookAuthButton = React.forwardRef<
  HTMLButtonElement,
  FacebookAuthButtonProps
>((props, ref) => {
  const { t } = useTranslation();
  const {
    className,
    label = `${t("global.continue_with", { provider: "Facebook" })}`,
    ...rest
  } = props;

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
