import React from "react";
import type { loader } from "./loader";
import { useConversation } from "@11labs/react";
import { useCallback, useState } from "react";
import { MainButton } from "components/MainButton/MainButton";
import { Transcript } from "components/Transcript/Transcript";
import { Avatar } from "components/Avatar/Avatar";
import { useTranscriptStore } from "../../stores/transcriptStore";

const Privacy: React.FC = () => {
  return (
    <div className="pb-8">
      <h1 className="text-4xl mt-8">Privacy Policy</h1>
      <br />
      <p className="font-bold">
        Effective Date: 06/01/2025
        <br />
        <br />
      </p>
      <p>
        Thank you for using our conversational AI ("the Assistant"). Your
        privacy is important to us. This Privacy Policy explains how we collect,
        use, and protect your information when you interact with the Assistant.
      </p>
      <h2 className="mt-7 mb-4 text-3xl">1. Information We Collect</h2>
      <p>
        We may collect the following types of information when you interact with
        the Assistant:
        <br />
        <br />
        a. Personal Information (optional)
        <br />
        <br />
        <ul className="list-disc pl-6">
          <li>Your name or username</li>

          <li>Email address</li>

          <li>Any other personal information you voluntarily provide</li>
        </ul>
        <br />
        <br />
        b. Usage Data
        <br />
        <br />
        <ul className="list-disc pl-6">
          <li>Interactions with the Assistant (questions, responses)</li>
          <li>Timestamps of interactions</li>
          <li>Language and location preferences (if provided)</li>
        </ul>
        <br />
        <br />
        c. Device & Technical Information
        <br />
        <br />
        <ul className="list-disc pl-6">
          <li>Browser type</li>
          <li>IP address</li>
          <li>Operating system</li>
          <li>Device identifiers</li>
        </ul>
        <br />
      </p>
      <h2 className="mt-7 mb-4 text-3xl">2. How We Use Your Information</h2>
      We use your information to:
      <br />
      <br />
      <ul className="list-disc pl-6">
        <li>Provide, maintain, and improve the Assistant's performance</li>
        <li>Personalize your experience</li>

        <li>Troubleshoot issues and ensure security</li>

        <li>Analyze usage trends and improve our services</li>

        <li>Communicate with you, if you've opted in</li>
      </ul>
      <h2 className="mt-7 mb-4 text-3xl">3. Data Storage and Retention</h2>
      Interaction data may be stored to improve assistant quality and support
      future features.
      <br />
      Data is stored securely and access is limited to authorized personnel.
      <br />
      Personal information is retained only as long as necessary to fulfill the
      purposes outlined in this policy.
      <h2 className="mt-7 mb-4 text-3xl">4. Third-Party Services</h2>
      We may use third-party services (e.g., cloud hosting, analytics, AI
      providers) that help us operate and improve the Assistant. These services
      may have access to your data only to perform specific tasks on our behalf
      and are obligated not to disclose or use it for any other purpose.
      <h2 className="mt-7 mb-4 text-3xl">5. Your Choices and Rights</h2>
      You may:
      <br />
      <br />
      <ul className="list-disc pl-6">
        <li>Request access to or deletion of your personal information</li>

        <li>Opt out of marketing communications if applicable</li>

        <li>Limit the information you provide to the Assistant</li>
      </ul>
      <br />
      To exercise these rights, contact us at:{" "}
      <a href="mailto:hello@ayapi.ai">hello@ayapi.ai</a>
      <br />
      <br />
      <h2 className="mt-7 mb-4 text-3xl">6. Security</h2>
      We implement appropriate technical and organizational measures to protect
      your information from unauthorized access, disclosure, or destruction.
      However, no method of transmission over the internet is 100% secure.
      <h2 className="mt-7 mb-4 text-3xl">7. Children's Privacy</h2>
      The Assistant is not intended for use by children under 13. We do not
      knowingly collect personal information from children.
      <h2 className="mt-7 mb-4 text-3xl">8. Changes to This Policy</h2>
      We may update this Privacy Policy from time to time. When we do, we will
      revise the "Effective Date" at the top of the page. We encourage you to
      review this page periodically.
      <h2 className="mt-7 mb-4 text-3xl">9. Contact Us</h2>
      If you have questions about this Privacy Policy, please contact us at:
      <a href="mailto:hello@ayapi.ai">hello@ayapi.ai</a>
    </div>
  );
};

export default Privacy;
