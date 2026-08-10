import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Every clickable €/client figure on Diagnostic gets one of these — the
// spec's "jamais cacher la méthode de calcul" rule made literal, not just a
// tooltip attribute (the breakdown is often multi-line/detailed).
export function CalcPopover({ explanation }: { explanation: string }) {
  const t = useTranslations("common.shared");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("calculatedHow")}
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-signal"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="font-bold">{t("calculatedHow")}</p>
        <p className="mt-1 text-muted-foreground">{explanation}</p>
      </PopoverContent>
    </Popover>
  );
}
