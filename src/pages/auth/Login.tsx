import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  afterShutter,
  Field,
  filled,
  FormLink,
  PasswordField,
  SubmitButton,
} from "@/components/auth/fields";
import { useAuth } from "@/app/AuthProvider";
import { loginSchema, type LoginValues } from "@/validators";

import { creationProfileRepository } from "@/repositories/creation-profile.repository";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // The photo wall develops as the form fills in, and fully on success.
  const develop = done ? 1 : filled(watch("email"), 18) * 0.55 + filled(watch("password"), 8) * 0.45;

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      await signIn(values.email, values.password);
      sessionStorage.removeItem("is_new_signup");
      await creationProfileRepository.markCompleteForLogin().catch(() => {});
      toast.success("Welcome back!");
      setDone(true);
      await afterShutter();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" && from !== "/onboarding" ? from : "/", { replace: true });
    } catch (error) {
      toast.error("Sign in failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      heading={["Welcome", "back."]}
      subtitle="Log in to your content workspace."
      develop={develop}
    >
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

        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          aside={
            <FormLink to="/forgot-password" className="text-[13px]">
              Forgot password?
            </FormLink>
          }
          {...register("password")}
        />

        <SubmitButton loading={submitting} loadingLabel="Logging in">
          Log in
        </SubmitButton>

        <p className="pt-2 text-center text-[14px] text-rl-muted">
          New to Rally? <FormLink to="/register" className="text-rl-ink">Sign up</FormLink>
        </p>
      </form>
    </AuthShell>
  );
}
