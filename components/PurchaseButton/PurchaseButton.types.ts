import { ButtonProps as ReactAriaButtonProps } from "react-aria-components";

export type PurchaseButtonBaseProps = {
  className?: string;

  cta?: string | React.ReactNode;
};

export type PurchaseButtonProps = ReactAriaButtonProps &
  PurchaseButtonBaseProps;
