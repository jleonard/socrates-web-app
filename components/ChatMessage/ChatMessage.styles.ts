import { tv } from "../../app/utils/tv";

export const chatMessageStyles = tv({
  base: "flex flex-initial rounded-l-lg rounded-r-lg bg-transparent px-5 py-3 text-primary",
  variants: {
    messageType: {
      incoming: [
        "self-start",
        "rounded-l-xs",
        "first:rounded-bl-xs first:rounded-tl-lg", // pointed corner for first message
        "last:rounded-bl-lg last:rounded-tl-xs", // pointed corners for last messages
        "only:rounded-bl-xs only:rounded-tl-lg", // pointed corner on top when message is the only entry in a group
      ],
      outgoing: [
        "bg-paper-dark",
        "self-end",
        "rounded-r-xs",
        "first:rounded-br-xs first:rounded-tr-lg", // pointed corner for first message
        "last:rounded-br-lg last:rounded-tr-xs", // pointed corners for last messages
        "only:rounded-br-xs only:rounded-tr-lg", // pointed corner on top when message is the only entry in a group
      ],
    },
  },
});
