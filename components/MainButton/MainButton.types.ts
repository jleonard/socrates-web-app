import { ButtonProps as ReactAriaButtonProps } from "react-aria-components";

export type MainButtonModes =
  | "speaking"
  | "listening"
  | "disconnected"
  | "connecting";

export type UserAccessModes =
  | "active"
  | "expired"
  | "trial"
  | "none"
  | "unused";

export type MainButtonBaseProps = {
  className?: string;

  mode: MainButtonModes;

  userAccess: UserAccessModes;

  expiration: Date;
};

export type MainButtonProps = ReactAriaButtonProps & MainButtonBaseProps;
