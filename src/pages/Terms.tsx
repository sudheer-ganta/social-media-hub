import { Footer } from "@/components/layout/Footer";

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl text-gray-900 dark:text-gray-100 flex-grow">
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        <div className="space-y-6">
          <p className="text-lg">
            Please read these Terms of Service carefully before using our services.
          </p>
          
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-700 dark:text-gray-300">
              By accessing or using our services, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. User Accounts</h2>
            <p className="text-gray-700 dark:text-gray-300">
              When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Intellectual Property</h2>
            <p className="text-gray-700 dark:text-gray-300">
              The Service and its original content, features, and functionality are and will remain the exclusive property of our company and its licensors.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
