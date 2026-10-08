import { PublicPage } from "@/components/layout/PublicPage";
import { Link } from "react-router-dom";
import { ShieldCheck, Mail, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DataDeletion() {
  return (
    <PublicPage
      title="User Data Deletion Instructions"
      intro="Rally is committed to protecting your privacy and giving you complete control over your data. In compliance with Meta (Facebook/Instagram), TikTok, X (Twitter), and GDPR/CCPA regulations, you have full rights to request the permanent deletion of your data at any time."
      width="wide"
    >
        <div className="space-y-8 text-sm md:text-base leading-relaxed">
          {/* Summary Box */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-start gap-4">
            <ShieldCheck className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground text-base">Rally Privacy Commitment</h3>
              <p className="text-muted-foreground text-sm mt-1">
                We do not sell your personal data. When you delete your account or disconnect social channels, all associated access tokens, connected account details, media assets, and post history are permanently erased from our active databases.
              </p>
            </div>
          </div>

          {/* Section 1: Self-Service Deletion */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              1. Self-Service In-App Data Deletion
            </h2>
            <p className="text-muted-foreground">
              You can instantly remove your data directly within the Rally application:
            </p>
            <div className="grid gap-4 sm:grid-cols-2 mt-3">
              <div className="p-4 rounded-lg border border-border bg-card">
                <h4 className="font-semibold mb-1 text-foreground">Disconnect Social Channels</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Go to <strong className="text-foreground">Integrations</strong>, locate your connected account (Facebook, Instagram, LinkedIn, etc.), and click <strong className="text-foreground">Disconnect</strong>. This immediately deletes all stored OAuth access tokens from our system.
                </p>
                <Button size="sm" variant="outline" asChild className="w-full">
                  <Link to="/integrations">Go to Integrations</Link>
                </Button>
              </div>

              <div className="p-4 rounded-lg border border-border bg-card">
                <h4 className="font-semibold mb-1 text-foreground">Delete Your Rally Account</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Go to <strong className="text-foreground">Settings</strong> &gt; <strong className="text-foreground">Account</strong> and select <strong className="text-foreground">Delete Account</strong>. This permanently purges your user profile, posts, drafts, and settings.
                </p>
                <Button size="sm" variant="outline" asChild className="w-full">
                  <Link to="/settings">Go to Settings</Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Section 2: Meta / Facebook / Instagram Revocation */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">
              2. How to Remove Rally via Facebook / Meta Settings
            </h2>
            <p className="text-muted-foreground">
              If you connected your Facebook Page or Instagram Business account to Rally, you can revoke access at any time directly through Meta:
            </p>
            <ol className="list-decimal list-inside space-y-2 pl-2 text-muted-foreground">
              <li>Log in to your Facebook account and go to <strong className="text-foreground">Settings & Privacy &gt; Settings</strong>.</li>
              <li>Navigate to <strong className="text-foreground">Apps and Websites</strong> in the left sidebar menu.</li>
              <li>Search for <strong className="text-foreground">Rally</strong> in the app list.</li>
              <li>Click <strong className="text-foreground">Remove</strong> next to Rally to revoke all permissions.</li>
              <li>Optionally, check the box to request Facebook to delete all post data created via Rally.</li>
            </ol>
            <div className="pt-2">
              <a
                href="https://www.facebook.com/settings?tab=applications"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
              >
                Open Facebook App Settings <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </section>

          {/* Section 3: Manual Data Deletion Request */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">
              3. Requesting Manual Data Deletion via Email
            </h2>
            <p className="text-muted-foreground">
              If you no longer have access to your Rally account, or if you wish to request a formal manual deletion of all historical records, please send an email request to our privacy team:
            </p>

            <div className="p-4 rounded-lg border border-border bg-card space-y-2">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Mail className="h-4 w-4 text-primary" />
                Contact Email: <a href="mailto:privacy@userally.in" className="text-primary hover:underline">privacy@userally.in</a>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Subject Line:</strong> Rally User Data Deletion Request
              </p>
              <p className="text-xs text-muted-foreground">
                Please include your registered email address and any connected social handles so we can verify account ownership.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              <strong>Processing Time:</strong> Manual deletion requests are processed and completed within <strong>30 days</strong> of verification. A confirmation email will be sent upon completion.
            </p>
          </section>

          {/* Section 4: Scope of Deleted Data */}
          <section className="space-y-3 border-t border-border pt-6">
            <h2 className="text-lg font-semibold text-foreground">
              4. Scope of Data Deletion
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="p-3 rounded bg-muted/40 border border-border">
                <h4 className="font-semibold text-destructive mb-1 font-mono">DATA ERASURE INCLUDES</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Account email and password hashes</li>
                  <li>OAuth tokens for Facebook, Instagram, LinkedIn, X</li>
                  <li>Draft posts, scheduled content, and media assets</li>
                  <li>Analytics snapshots and workspace preferences</li>
                </ul>
              </div>

              <div className="p-3 rounded bg-muted/40 border border-border">
                <h4 className="font-semibold text-foreground mb-1 font-mono">TEMPORARY EXCEPTIONS</h4>
                <p className="text-muted-foreground">
                  Anonymized server log entries retained strictly for security audit purposes are purged automatically after 90 days.
                </p>
              </div>
            </div>
          </section>
        </div>
    </PublicPage>
  );
}
