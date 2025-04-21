import { tv } from "../../app/utils/tv";

export const ButtonStyles = tv({
  base: "flex items-center rounded-sm",
  variants: {
    size: {
      default: "gap-4 px-6 py-5",
      small: "gap-3 px-4 py-3",
    },
    disabled: {
      true: "cursor-default !text-disabled",
      false: "",
    },
    level: {
      primary:
        "bg-action-primary text-inverse hover:bg-action-primary-hover focus:bg-action-primary-focus",
      secondary: [
        "border border-action-secondary bg-action-secondary text-primary",
        "hover:border-action-secondary-hover hover:bg-action-secondary-hover",
        "focus:border-action-secondary-focus focus:bg-action-secondary-focus",
      ],
      tertiary: "bg-transparent text-primary hover:text-emphasis",
      destructive:
        "bg-critical text-inverse hover:bg-critical-subtle hover:text-primary focus:border-critical focus:bg-critical-subtle focus:text-primary",
    },
    compoundVariants: [
      {
        level: "primary",
        disabled: true,
        class:
          "bg-action-primary-disabled hover:bg-action-primary-disabled focus:bg-action-primary-disabled",
      },
      {
        level: ["secondary", "destructive"],
        disabled: true,
        class: [
          "bg-transparent hover:bg-transparent focus:bg-transparent", // bg-colors
          "border border-action-secondary-disabled hover:border-action-secondary-disabled focus:border-action-secondary-disabled", // border colors
        ],
      },
      {
        level: "tertiary",
        disabled: true,
        class:
          "bg-transparent text-disabled hover:bg-transparent focus:bg-transparent",
      },
    ],
  },
});
