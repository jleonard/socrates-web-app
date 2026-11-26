import type { MicBrowser, MicProblem } from "~/utils/mic.client";

export type MicHelpProps = {
  problem: MicProblem;
  browser: MicBrowser;
  /** the link to open in another browser (in-app browsers) */
  link: string;
  onClose: () => void;
};
