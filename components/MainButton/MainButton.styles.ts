import { tv } from "../../app/utils/tv";

export const MainButtonStyles = tv({
  base: [
    "bg-black text-white",
    "flex items-center justify-center",
    "w-full max-w-[700px] p-0",
    "rounded-t-xl rounded-b-none",
    "transition-[height]",
  ],
  variants: {
    active: {
      true: "h-[820px]",
      false: "h-72",
    },
  },
});
