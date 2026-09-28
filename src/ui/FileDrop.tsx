import { useState } from 'react';

interface Props {
  what: string;
  fileName: string | null;
  error: string | null;
  rowCount: number | null;
  onPick: (file: File) => void;
}

export default function FileDrop({ what, fileName, error, rowCount, onPick }: Props) {
  const [over, setOver] = useState(false);

  const state = error
    ? error
    : fileName
      ? `${fileName} · ${rowCount ?? 0} rows`
      : 'Drop the CSV here, or click to choose';

  const className = [
    'drop',
    over ? 'over' : '',
    error ? 'failed' : fileName ? 'loaded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onPick(file);
      }}
    >
      <span className="what">{what}</span>
      <span className="state">{state}</span>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={what}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
