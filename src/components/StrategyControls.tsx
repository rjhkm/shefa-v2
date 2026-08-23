import type { InputSchema, StrategySchema } from "../types";

type Props = {
  strategy: StrategySchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

function Control({ input, value, onChange }: { input: InputSchema; value: unknown; onChange: Props["onChange"] }) {
  if (input.type === "bool") {
    return (
      <label className="toggle-row">
        <span>{input.label}</span>
        <button
          type="button"
          className={`toggle ${value ? "on" : ""}`}
          aria-pressed={Boolean(value)}
          onClick={() => onChange(input.key, !value)}
        ><span /></button>
      </label>
    );
  }
  if (input.type === "choice") {
    return (
      <label className="field">
        <span>{input.label}</span>
        <select value={String(value)} onChange={(event) => onChange(input.key, event.target.value)}>
          {input.options?.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="field">
      <span>{input.label}</span>
      <input
        type="number"
        value={Number(value)}
        min={input.min}
        max={input.max}
        step={input.step || (input.type === "int" ? 1 : 0.1)}
        onChange={(event) => onChange(input.key, input.type === "int" ? Number.parseInt(event.target.value) : Number(event.target.value))}
      />
    </label>
  );
}

export default function StrategyControls({ strategy, values, onChange }: Props) {
  const groups = [...new Set(strategy.parameters.map((input) => input.group))];
  return (
    <div className="control-groups">
      {groups.map((group) => (
        <section className="control-group" key={group}>
          <h3>{group}</h3>
          {strategy.parameters.filter((input) => input.group === group).map((input) => (
            <Control key={input.key} input={input} value={values[input.key]} onChange={onChange} />
          ))}
        </section>
      ))}
    </div>
  );
}
