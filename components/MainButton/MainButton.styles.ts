import { tv } from "../../app/utils/tv";

export const MainButtonStyles = tv({
  base: [
    "bg-black text-white",
    "flex items-center justify-center",
    "size-[72px]",
    //"w-full max-w-[700px] p-0",
    "rounded-full",
    "transition-[height]",
  ],
  variants: {
    active: {
      true: "",
      false: "",
    },
  },
});
