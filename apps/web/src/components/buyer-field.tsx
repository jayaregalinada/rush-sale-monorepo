interface BuyerFieldProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/** Labelled input where the buyer types the identifier their reservation is keyed on. */
export function BuyerField({ value, disabled, onChange }: BuyerFieldProps) {
  return (
    <label className="field">
      <span className="field__label">Your identifier</span>
      <input
        className="field__input"
        type="text"
        value={value}
        disabled={disabled}
        placeholder="username or email"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
