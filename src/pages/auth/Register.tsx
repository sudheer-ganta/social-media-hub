import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  afterShutter,
  Field,
  filled,
  FormLink,
  Notice,
  NoticeButton,
  PasswordField,
  SubmitButton,
} from "@/components/auth/fields";
import { useAuth } from "@/app/AuthProvider";
import { registerSchema, type RegisterValues } from "@/validators";

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  // The photo wall develops as the form fills in, and fully once the account exists.
  const develop =
    done || confirmationSent
      ? 1
      : filled(watch("fullName"), 10) * 0.2 +
        filled(watch("email"), 18) * 0.3 +
        filled(watch("password"), 8) * 0.3 +
        filled(watch("confirmPassword"), 8) * 0.2;

  const onSubmit = async (values: RegisterValues) => {
    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUp(
        values.email,
        values.password,
        values.fullName,
      );
      if (needsEmailConfirmation) {
        setConfirmationSent(true);
      } else {
        sessionStorage.setItem("is_new_signup", "true");
        toast.success("Account created, welcome!");
        setDone(true);
        await afterShutter();
        navigate("/", { replace: true });
      }
    } catch (error) {
      toast.error("Registration failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <AuthShell heading={["Check your", "inbox."]} subtitle="One more step to go." develop={1}>
        <Notice
          icon={<MailCheck className="h-6 w-6" aria-hidden="true" />}
          action={<NoticeButton to="/login">Back to log in</NoticeButton>}
        >
          We sent a confirmation link to your email. Click it to activate your account, then
          log in.
        </Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={["Create your", "account."]}
      subtitle="Free to start, no credit card required."
      develop={develop}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Field
          id="fullName"
          label="Full name"
          autoComplete="name"
          placeholder="Alex Morgan"
          error={errors.fullName?.message}
          {...register("fullName")}
        />

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <PasswordField
            id="password"
            label="Password"
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm"
            autoComplete="new-password"
            placeholder="Repeat password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
        </div>

        <SubmitButton loading={submitting} loadingLabel="Creating account">
          Create account
        </SubmitButton>

        <p className="pt-2 text-center text-[14px] text-rl-muted">
          Already have an account? <FormLink to="/login" className="text-rl-ink">Log in</FormLink>
        </p>
      </form>
    </AuthShell>
  );
}
