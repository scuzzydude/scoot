export default function PrivacyPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-6 py-10 max-w-2xl mx-auto text-white/80">
      <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
      <p className="text-sm text-white/50 mb-8">The Dream Laboratory — Last updated: June 7, 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-semibold text-white mb-2">1. Overview</h2>
          <p>
            This Privacy Policy describes how The Dream Laboratory ("we", "us") collects, uses, and
            protects information when you use the Scoot platform (the "Service") at
            thedreamlaboratory.org, including any SMS messages we send or receive in connection with
            the Service.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">2. Information We Collect</h2>
          <p>
            We collect information you provide directly, including your name, mobile phone number,
            and any content you submit through the Service. We also collect usage data such as
            session activity, device type, and interaction logs to operate and improve the Service.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">3. How We Use Information</h2>
          <p>
            We use the information we collect to operate the Service, deliver messages you have
            asked to receive, authenticate sessions, prevent abuse, and improve reliability. We do
            not use your mobile number for marketing by third parties.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">4. SMS Messaging Program</h2>
          <p className="mb-3">
            When you provide your mobile phone number and opt in through the Scoot app, you consent
            to receive SMS messages from The Dream Laboratory for purposes including account
            notifications, verification codes, event reminders, schedule updates, parking and
            traffic alerts, and prayer notices.
          </p>
          <p className="font-medium text-white/70 mb-2">Required carrier disclosures:</p>
          <ul className="list-disc list-inside space-y-1 mb-3">
            <li>
              <span className="font-medium">Message frequency:</span> Message frequency varies based
              on your activity and subscriptions.
            </li>
            <li>
              <span className="font-medium">Charges:</span> Message and data rates may apply.
              Contact your wireless provider for details.
            </li>
            <li>
              <span className="font-medium">Carrier liability:</span> Carriers are not liable for
              delayed or undelivered messages.
            </li>
          </ul>
          <p className="mb-3">
            We do not share, sell, rent, or trade your mobile phone number or any SMS opt-in data
            with third parties or affiliates for marketing or promotional purposes.
          </p>
          <p>
            Phone numbers collected for SMS are used solely to deliver the SMS service you have
            requested. Information may be shared only with subprocessors strictly necessary to
            deliver the Service (for example, our SMS carrier, Twilio Inc.) and only to the extent
            required to operate the messaging functionality.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">5. SMS Opt-Out</h2>
          <p>
            Reply <span className="font-mono text-white">STOP</span>,{" "}
            <span className="font-mono text-white">CANCEL</span>,{" "}
            <span className="font-mono text-white">END</span>,{" "}
            <span className="font-mono text-white">QUIT</span>, or{" "}
            <span className="font-mono text-white">UNSUBSCRIBE</span> to any SMS from us at any time
            to unsubscribe. You will receive a single confirmation that you have been opted out.
            After that, we will not send further SMS unless you opt in again.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">6. SMS Help</h2>
          <p>
            Reply <span className="font-mono text-white">HELP</span> to any SMS from us for
            assistance, or contact us at{" "}
            <a
              href="mailto:privacy@thedreamlaboratory.org"
              className="text-white underline underline-offset-2"
            >
              privacy@thedreamlaboratory.org
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">7. Data Security</h2>
          <p>
            Data is stored on servers operated on our behalf in commercial data centers. We use
            industry-standard transport encryption (HTTPS / TLS) for traffic between your device and
            the Service. Access to personal data is restricted to operators of the Service who
            require it to perform their duties.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">8. Data Retention</h2>
          <p>
            We retain account and message data for as long as your account is active. You may
            request deletion of your account and associated personal data by contacting us. We will
            retain limited records (for example, opt-out lists) as required to comply with
            applicable law.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">9. Children's Privacy</h2>
          <p>
            The Service is not directed to children under 13, and we do not knowingly collect
            personal information from children under 13.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be reflected
            by updating the "Last updated" date above and, where appropriate, by additional notice
            within the Service.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">11. Contact</h2>
          <p>Questions about this policy or our SMS program:</p>
          <a
            href="mailto:privacy@thedreamlaboratory.org"
            className="text-white underline underline-offset-2"
          >
            privacy@thedreamlaboratory.org
          </a>
        </div>
      </section>

      <footer className="mt-12 pt-6 border-t border-white/10 text-xs text-white/40">
        © 2026 The Dream Laboratory ·{" "}
        <a href="/terms" className="underline underline-offset-2">
          Terms of Service
        </a>
      </footer>
    </div>
  );
}
