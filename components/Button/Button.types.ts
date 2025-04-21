import { ButtonProps as ReactAriaButtonProps } from "react-aria-components";

export type ButtonBaseProps = {
  /** Additional classnames applied to the wrapper of the element. */
  className?: string;

  /** Disabled state will remove focus and show disabled state styles. */
  disabled?: boolean;

  /** Hierarchy of element. */
  level?: "primary" | "secondary" | "tertiary" | "destructive";

  /** Size of element. */
  size?: "small" | "default";

  /** Drops all css except for className and the focus-ring styles */
  unstyled?: boolean;
};

export type ButtonProps = ReactAriaButtonProps & ButtonBaseProps;
