import { ButtonHTMLAttributes } from "react";

export type FacebookAuthButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Additional classnames applied to the wrapper of the element. */
    className?: string;

    /** Optional label to show inside the button */
    label?: string;
  };
