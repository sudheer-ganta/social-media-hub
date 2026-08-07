import { Footer } from "@/components/layout/Footer";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl text-gray-900 dark:text-gray-100 flex-grow">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <div className="space-y-6">
          <p className="text-lg">
            This Privacy Policy describes how we collect, use, and handle your information when you use our services.
          </p>
          
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We collect information you provide directly to us, such as when you create or modify your account, use our services, or communicate with us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How We Use Information</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We use the information we collect to provide, maintain, and improve our services, and to protect us and our users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Information Sharing</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We do not share your personal information with third parties except as described in this privacy policy.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
