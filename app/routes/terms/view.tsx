import React from "react";

const Privacy: React.FC = () => {
  return (
    <section className="h-full overflow-auto scrollbar-hide">
      <div className="mt-8 pb-56 overflow-y-scroll">
        <h1 className="text-4xl mt-8">Terms of Service</h1>
        <br />
        <p className="font-bold">Effective Date: 06/01/2025</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using our website and conversational AI assistant
          ("the Service"), you agree to be bound by these Terms of Service. If
          you do not agree to these terms, you may not use the Service.
        </p>

        <h2 className="mt-7 mb-4 text-3xl">2. Description of Service</h2>
        <p>
          The Service provides users with access to a conversational AI that can
          respond to inquiries, generate content, and assist with various tasks.
          We may update or change the features at any time.
        </p>

        <h2 className="mt-7 mb-4 text-3xl">3. User Conduct</h2>
        <p>
          You agree not to use the Service for any unlawful, harmful, or abusive
          purposes. You are solely responsible for the content you submit or
          interact with, and you must not use the Service to transmit any
          offensive, threatening, or misleading information.
        </p>

        <h2 className="mt-7 mb-4 text-3xl">4. Intellectual Property</h2>
        <p>
          All content, features, and functionality provided by the Service
          (including but not limited to text, images, audio, and code) are owned
          by us or our licensors and are protected by intellectual property
          laws. You may not reproduce, distribute, or create derivative works
          without permission.
        </p>

        <h2 className='className="mt-7 mb-4 text-3xl"'>5. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <a href="/privacy.html">Privacy Policy</a>, which describes how we
          collect, use, and protect your information.
        </p>

        <h2 className='className="mt-7 mb-4 text-3xl"'>6. Termination</h2>
        <p>
          We reserve the right to suspend or terminate your access to the
          Service at our sole discretion, without notice, if we believe you have
          violated these Terms.
        </p>

        <h2 className='className="mt-7 mb-4 text-3xl"'>7. Disclaimers</h2>
        <p>
          The Service is provided "as is" and "as available" without warranties
          of any kind. We do not guarantee that the Service will be error-free,
          secure, or uninterrupted.
        </p>

        <h2 className='className="mt-7 mb-4 text-3xl"'>
          8. Limitation of Liability
        </h2>
        <p>
          To the fullest extent permitted by law, we are not liable for any
          indirect, incidental, or consequential damages arising from your use
          of the Service.
        </p>

        <h2 className="mt-7 mb-4 text-3xl">9. Changes to Terms</h2>
        <p>
          We may modify these Terms at any time. Updated versions will be posted
          on this page with a revised effective date. Continued use of the
          Service constitutes acceptance of the changes.
        </p>

        <h2 className="mt-7 mb-4 text-3xl">10. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at{" "}
          <a href="mailto:hello@ayapi.ai">hello@ayapi.ai</a>.
        </p>
      </div>
    </section>
  );
};

export default Privacy;
