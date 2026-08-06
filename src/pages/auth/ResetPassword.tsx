import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/AuthProvider";
import { resetPasswordSchema, type ResetPasswordValues } from "@/validators";

/**
 * Landing page for the Supabase recovery link. The link signs the user
 * into a recovery session, so updateUser({ password }) works directly.
 */
export default function ResetPassword() {
  const { session, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    setSubmitting(true);
    try {
      await updatePassword(values.password);
      toast.success("Password updated — you're signed in.");
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
    <AuthLayout
      title="Choose a new password"
      subtitle="Make it long, unique and memorable."
    >
      {!session ? (
        <div className="rounded-lg border bg-card p-6 text-center shadow-soft">
          <p className="text-sm text-muted-foreground">
            This page only works from the reset link we email you. Request a
            fresh link and try again.
          </p>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link to="/forgot-password">Request reset link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs font-medium text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-xs font-medium text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={submitting}>
            <KeyRound />
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
