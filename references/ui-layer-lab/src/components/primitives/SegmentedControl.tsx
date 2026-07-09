export type SegmentOption<T extends string> = {
  label: string;
  value: T;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  value: T;
}) {
  return (
    <div className="segmented-control" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          aria-selected={option.value === value}
          className={option.value === value ? "active" : ""}
          data-stable-control="segmented"
          key={option.value}
          onClick={() => onChange(option.value)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
