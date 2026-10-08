import { LegalSection, PublicPage } from "@/components/layout/PublicPage";

export default function Privacy() {
  return (
    <PublicPage
      title="Privacy Policy"
      intro="This Privacy Policy describes how we collect, use, and handle your information when you use our services."
    >
      <LegalSection heading="1. Information We Collect">
        We collect information you provide directly to us, such as when you create or modify your account, use our services, or communicate with us.
      </LegalSection>
      <LegalSection heading="2. How We Use Information">
        We use the information we collect to provide, maintain, and improve our services, and to protect us and our users.
      </LegalSection>
      <LegalSection heading="3. Information Sharing">
        We do not share your personal information with third parties except as described in this privacy policy.
      </LegalSection>
    </PublicPage>
  );
}
