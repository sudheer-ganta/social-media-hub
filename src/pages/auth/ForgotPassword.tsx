import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, MailCheck, Send } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/AuthProvider";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/validators";

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setSubmitting(true);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (error) {
      toast.error("Couldn't send reset link", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure reset link."
    >
      {sent ? (
        <div className="rounded-lg border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <MailCheck className="h-6 w-6 text-success" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            If an account exists for that email, a reset link is on its way.
            Follow it to choose a new password.
          </p>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link to="/login">
              <ArrowLeft />
              Back to sign in
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs font-medium text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={submitting}>
            <Send />
            Send reset link
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
