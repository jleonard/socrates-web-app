export type CirclesProps = React.HTMLProps<HTMLDivElement> & {
  className?: string;

  /** The mode the avatar is in */
  mode: "speaking" | "connected" | "processing" | "idle" | "error";
};
