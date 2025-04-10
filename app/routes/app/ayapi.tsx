import React from "react";
import type { loader } from "./app.loader";

const ParentComponent: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-screen">
      {/* @ts-ignore */}
      <elevenlabs-convai agent-id="vSIN4qZQknqFJJiIdsfW"></elevenlabs-convai>
      <script
        src="https://elevenlabs.io/convai-widget/index.js"
        async
        type="text/javascript"
      ></script>
    </div>
  );
};

export default ParentComponent;
