export type CircleMode =
  | "speaking"
  | "connected"
  | "processing"
  | "idle"
  | "error"
  | "preconnect";

export type CirclesProps = React.HTMLProps<HTMLDivElement> & {
  className?: string;

  /** The mode the avatar is in */
  mode: CircleMode;
};
