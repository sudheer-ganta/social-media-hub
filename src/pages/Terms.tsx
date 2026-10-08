import { LegalSection, PublicPage } from "@/components/layout/PublicPage";

export default function Terms() {
  return (
    <PublicPage
      title="Terms of Service"
      intro="Please read these Terms of Service carefully before using our services."
    >
      <LegalSection heading="1. Acceptance of Terms">
        By accessing or using our services, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service.
      </LegalSection>
      <LegalSection heading="2. User Accounts">
        When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms.
      </LegalSection>
      <LegalSection heading="3. Intellectual Property">
        The Service and its original content, features, and functionality are and will remain the exclusive property of our company and its licensors.
      </LegalSection>
    </PublicPage>
  );
}
