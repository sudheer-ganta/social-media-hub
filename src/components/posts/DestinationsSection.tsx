import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { PlatformSelector } from "./PlatformSelector";
import { useComposerState } from "./ComposerStateContext";
import type { PostFormValues } from "@/validators";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

export function DestinationsSection() {
  const { control, formState: { errors } } = useFormContext<PostFormValues>();
  const { integrations, contextLabel, isPublished } = useComposerState();

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Publish Platforms</Label>
      <Controller
        control={control}
        name="platforms"
        render={({ field }) => (
          <PlatformSelector
            value={field.value || []}
            onChange={field.onChange}
            integrations={integrations}
            contextLabel={contextLabel}
            disabled={isPublished}
          />
        )}
      />
      <FieldError message={errors.platforms?.message} />
    </div>
  );
}
