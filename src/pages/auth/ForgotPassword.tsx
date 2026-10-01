import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  Field,
  filled,
  FormLink,
  Notice,
  NoticeButton,
  SubmitButton,
} from "@/components/auth/fields";
import { useAuth } from "@/app/AuthProvider";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/validators";

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  // The photo wall develops as the email is typed, and fully once the link is sent.
  const develop = sent ? 1 : filled(watch("email"), 18) * 0.8;

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
    <AuthShell
      heading={sent ? ["Check your", "inbox."] : ["Reset your", "password."]}
      subtitle={sent ? "One more step to go." : "We'll email you a secure reset link."}
      develop={develop}
    >
      {sent ? (
        <Notice
          icon={<MailCheck className="h-6 w-6" aria-hidden="true" />}
          action={
            <NoticeButton to="/login" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to log in
            </NoticeButton>
          }
        >
          If an account exists for that email, a reset link is on its way. Follow it to choose a
          new password.
        </Notice>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <SubmitButton loading={submitting} loadingLabel="Sending">
            Send reset link
          </SubmitButton>

          <p className="pt-2 text-center text-[14px] text-rl-muted">
            Remembered it? <FormLink to="/login" className="text-rl-ink">Log in</FormLink>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
