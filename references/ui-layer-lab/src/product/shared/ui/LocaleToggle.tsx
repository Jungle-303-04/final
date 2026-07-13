import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  useI18n,
  type SupportedLocale,
} from "../i18n";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./primitives/select";

export function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  const labels: Record<SupportedLocale, string> = {
    en: t("shell.locale.english"),
    ko: t("shell.locale.korean"),
  };
  const items = SUPPORTED_LOCALES.map((value) => ({
    label: labels[value],
    value,
  }));
  const controlLabel = t("shell.locale.current", { language: labels[locale] });

  return (
    <Select
      items={items}
      onValueChange={(value) => {
        if (isSupportedLocale(value)) setLocale(value);
      }}
      value={locale}
    >
      <SelectTrigger
        aria-label={controlLabel}
        className="w-(--product-toolbar-compact-control-width) min-w-0"
        size="sm"
      >
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectLabel>{t("shell.locale.label")}</SelectLabel>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
