import { ButtonProps as ReactAriaButtonProps } from "react-aria-components";

export type MainButtonBaseProps = {
  /** Additional classnames applied to the wrapper of the element. */
  className?: string;

  /** Disabled state will remove focus and show disabled state styles. */
  active?: boolean;

  loading?: boolean;
};

export type MainButtonProps = ReactAriaButtonProps & MainButtonBaseProps;
