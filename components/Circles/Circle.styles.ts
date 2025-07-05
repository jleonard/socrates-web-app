import { tv } from "../../app/utils/tv";

export const CircleStyles = tv({
  base: "bg-black rounded-full absolute",
  variants: {
    size: {
      large: "size-60",
      medium: "size-12 bg-paper left-[98px] top-1/2 -translate-y-1/2",
      small: "",
      "x-small": "",
    },
  },
});
