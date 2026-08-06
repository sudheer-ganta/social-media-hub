import { PageContainer } from "@/components/layout/PageContainer";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function Settings() {
  return (
    <PageContainer
      title="Settings"
      description="Profile, defaults and notifications."
      className="max-w-4xl"
    >
      <SettingsForm />
    </PageContainer>
  );
}
