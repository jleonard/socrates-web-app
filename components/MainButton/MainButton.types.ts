import { ButtonProps as ReactAriaButtonProps } from "react-aria-components";
import { AccessCategory } from "~/types";

export type MainButtonModes =
  | "speaking"
  | "listening"
  | "disconnected"
  | "connecting";

export type MainButtonBaseProps = {
  className?: string;

  mode: MainButtonModes;

  userAccess: AccessCategory;

  expiration: string;
};

export type MainButtonProps = ReactAriaButtonProps & MainButtonBaseProps;
