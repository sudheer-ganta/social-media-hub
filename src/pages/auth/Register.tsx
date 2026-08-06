import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck, UserPlus } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/AuthProvider";
import { registerSchema, type RegisterValues } from "@/validators";

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

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
        toast.success("Account created — welcome!");
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
      <AuthLayout title="Check your inbox" subtitle="One more step to go.">
        <div className="rounded-lg border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <MailCheck className="h-6 w-6 text-success" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            We sent a confirmation link to your email. Click it to activate
            your account, then sign in.
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to start — no credit card required."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Alex Morgan"
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="text-xs font-medium text-destructive">
              {errors.fullName.message}
            </p>
          )}
        </div>

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

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
            <Label htmlFor="confirmPassword">Confirm</Label>
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
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          <UserPlus />
          Create account
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
