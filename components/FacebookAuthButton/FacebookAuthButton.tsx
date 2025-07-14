import { FaFacebookF } from "react-icons/fa"; // Facebook icon
import React from "react";

import { FacebookAuthButtonProps } from "./FacebookAuthButton.types";

export const FacebookAuthButton = React.forwardRef<
  HTMLButtonElement,
  FacebookAuthButtonProps
>((props, ref) => {
  const { className, label = "Continue with Facebook", ...rest } = props;

  return (
    <button
      {...rest}
      className="flex items-center gap-3 bg-[#1877F2] text-white font-medium px-4 py-2 rounded-md shadow hover:bg-[#166fe0] transition"
    >
      <FaFacebookF size={20} className="text-white" />
      <span>{label}</span>
    </button>
  );
});
