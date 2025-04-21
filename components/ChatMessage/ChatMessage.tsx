import { forwardRef } from "react";

import { chatMessageStyles } from "./ChatMessage.styles";
import { ChatMessageProps } from "./ChatMessage.types";

const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ text, messageType, className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={chatMessageStyles({ messageType, className })}
        {...rest}
      >
        <span>{text}</span>
      </div>
    );
  }
);

export default ChatMessage;
