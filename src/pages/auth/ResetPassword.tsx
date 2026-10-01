import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  afterShutter,
  filled,
  Notice,
  NoticeButton,
  PasswordField,
  SubmitButton,
} from "@/components/auth/fields";
import { useAuth } from "@/app/AuthProvider";
import { resetPasswordSchema, type ResetPasswordValues } from "@/validators";
import { KeyRound } from "lucide-react";

/**
 * Landing page for the Supabase recovery link. The link signs the user
 * into a recovery session, so updateUser({ password }) works directly.
 */
export default function ResetPassword() {
  const { session, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // The photo wall develops as the new password is chosen, and fully once it is saved.
  const develop = done ? 1 : filled(watch("password"), 8) * 0.5 + filled(watch("confirmPassword"), 8) * 0.5;

  const onSubmit = async (values: ResetPasswordValues) => {
    setSubmitting(true);
    try {
      await updatePassword(values.password);
      toast.success("Password updated, you're signed in.");
      setDone(true);
      await afterShutter();
      navigate("/", { replace: true });
    } catch (error) {
      toast.error("Couldn't update password", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      heading={["Choose a new", "password."]}
      subtitle="Make it long, unique and memorable."
      develop={develop}
    >
      {!session ? (
        <Notice
          icon={<KeyRound className="h-6 w-6" aria-hidden="true" />}
          action={
            <NoticeButton to="/forgot-password" variant="outline">
              Request reset link
            </NoticeButton>
          }
        >
          This page only works from the reset link we email you. Request a fresh link and try
          again.
        </Notice>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <PasswordField
            id="password"
            label="New password"
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            error={errors.password?.message}
            {...register("password")}
          />

          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
            placeholder="Repeat password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />

          <SubmitButton loading={submitting} loadingLabel="Updating">
            Update password
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
