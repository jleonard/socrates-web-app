import { ButtonHTMLAttributes } from "react";

export type GoogleAuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Additional classnames applied to the wrapper of the element. */
  className?: string;

  /** Optional label to show inside the button */
  label?: string;
};
