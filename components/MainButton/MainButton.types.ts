import { ButtonProps as ReactAriaButtonProps } from "react-aria-components";

export type MainButtonModes =
  | "speaking"
  | "listening"
  | "disconnected"
  | "connecting";

export type MainButtonBaseProps = {
  className?: string;

  mode: MainButtonModes;
};

export type MainButtonProps = ReactAriaButtonProps & MainButtonBaseProps;
