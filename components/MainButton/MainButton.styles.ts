import { tv } from "../../app/utils/tv";

export const MainButtonStyles = tv({
  base: [
    "bg-black text-white",
    "flex items-center justify-center",
    "size-[72px]",
    //"w-full max-w-[700px] p-0",
    "rounded-full",
    "transition-colors duration-500 ease-in-out",
  ],
  variants: {
    active: {
      true: "",
      false: "",
    },
    mode: {
      connecting: "",
      speaking: "",
      disconnected: "",
      listening: "bg-green-600 delay-100",
    },
  },
});
