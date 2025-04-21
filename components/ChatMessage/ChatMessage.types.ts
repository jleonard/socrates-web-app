export type ChatMessageProps = React.HTMLProps<HTMLDivElement> & {
  className?: string;

  /** The message string */
  text: string;

  /** Whether this message is from the user or the person/ai they are messaging. Defaults to true. */
  messageType: "outgoing" | "incoming";
};
