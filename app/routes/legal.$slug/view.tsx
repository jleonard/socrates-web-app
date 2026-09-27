import { Container } from "components/Container/Container";
import React from "react";
import ReactMarkdown from "react-markdown";
import { useLoaderData } from "react-router";
import type { loader } from "./loader";

const Legal: React.FC = () => {
  const { content } = useLoaderData<typeof loader>();
  return (
    <Container>
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-3xl font-bold mt-8 mb-4" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-2xl font-semibold mt-6 mb-3" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xl font-semibold mt-4 mb-2" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-4 leading-relaxed" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 mb-4" {...props} />
          ),
          a: ({ node, ...props }) => <a className="underline" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </Container>
  );
};

export default Legal;
