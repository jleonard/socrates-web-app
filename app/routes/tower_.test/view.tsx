// src/routes/test-transcription/view.tsx
import { useState } from "react";
import { Form, useActionData } from "react-router";

type ActionData = {
  corrected?: string;
};

export default function TestTranscriptionView() {
  const actionData = useActionData() as ActionData;
  const [input, setInput] = useState("");

  return (
    <div className="max-w-xl mx-auto mt-20 p-4">
      <h1 className="text-2xl font-bold mb-4">Transcription Test</h1>

      <Form method="post">
        <textarea
          name="query"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or paste a transcription here..."
          className="w-full p-2 border rounded mb-4 text-gray-900"
          rows={4}
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Correct
        </button>
      </Form>

      {actionData?.corrected && actionData.corrected.length > 0 && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <h2 className="font-semibold mb-2">Corrected Output:</h2>
          <p>{actionData.corrected}</p>
        </div>
      )}
    </div>
  );
}
