export type AvatarProps = React.HTMLProps<HTMLDivElement> & {
  className?: string;

  /** The mode the avatar is in */
  mode: "speaking" | "listening" | "processing" | "idle" | "error";
};
